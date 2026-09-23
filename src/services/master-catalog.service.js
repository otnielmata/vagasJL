const User = require('../models/user.model');
const MasterCatalogItem = require('../models/master-catalog-item.model');
const MatchProfileConfiguration = require('../models/match-profile-configuration.model');
const { CATEGORY_FIELDS, normalizeCatalogAlias } = require('../config/master-catalog');
const ApiError = require('../errors/api.error');

const ID = /^[a-z][a-z0-9_]*$/;
const REQUIRED_FIELDS = Object.freeze(['active', 'aliases', 'category', 'id', 'name']);
const OPTIONAL_FIELDS = Object.freeze(['effectiveAt', 'reason']);

function plain(value) {
  return value && typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true, versionKey: false }) : value;
}

function normalizeRequest(actor, category, id, input, now) {
  if (actor?.role !== 'admin' || typeof actor.id !== 'string' || !/^[a-f\d]{24}$/i.test(actor.id)) {
    throw new ApiError(403, 'Apenas administradores podem gerenciar o Catalogo Mestre');
  }
  if (!Object.hasOwn(CATEGORY_FIELDS, category) || typeof id !== 'string' || !ID.test(id) ||
      id.length > 100) throw new ApiError(400, 'Categoria ou identificador canonico invalido');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'Item do Catalogo Mestre invalido');
  }
  const keys = Object.keys(input);
  if (REQUIRED_FIELDS.some((key) => !keys.includes(key)) ||
      keys.some((key) => !REQUIRED_FIELDS.includes(key) && !OPTIONAL_FIELDS.includes(key)) ||
      input.category !== category || input.id !== id || typeof input.name !== 'string' ||
      !input.name.trim() || input.name.trim().length > 100 || !Array.isArray(input.aliases) ||
      input.aliases.length > 50 || typeof input.active !== 'boolean' ||
      input.aliases.some((alias) => typeof alias !== 'string' || !alias.trim() || alias.length > 100) ||
      (input.reason !== undefined && (typeof input.reason !== 'string' || !input.reason.trim() ||
        input.reason.trim().length > 500))) {
    throw new ApiError(422, 'Item do Catalogo Mestre invalido');
  }
  const effectiveAt = input.effectiveAt === undefined ? now : new Date(input.effectiveAt);
  if (Number.isNaN(effectiveAt.getTime()) || effectiveAt > now) {
    throw new ApiError(422, 'Vigencia do Catalogo Mestre invalida');
  }
  const aliases = [...new Set(input.aliases.map((alias) => alias.trim()))]
    .sort((left, right) => left.localeCompare(right));
  const normalizedAliases = [...new Set([id, input.name, ...aliases]
    .map(normalizeCatalogAlias))].sort();
  if (normalizedAliases.some((alias) => !alias)) {
    throw new ApiError(422, 'Nome ou alias do Catalogo Mestre invalido');
  }
  return { category, id, name: input.name.trim(), aliases, normalizedAliases,
    active: input.active, effectiveAt,
    reason: input.reason?.trim() || 'Publicacao administrativa do Catalogo Mestre' };
}

function comparable(item) {
  const value = plain(item);
  return { category: value.category, id: value.id, name: value.name,
    aliases: [...value.aliases].sort(), active: value.active };
}

function sameItem(left, right) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function latestItems(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.id}`;
    if (!latest.has(key) || row.revision > latest.get(key).revision) latest.set(key, row);
  }
  return [...latest.values()];
}

function assertAliasOwnership(item, rows) {
  if (!item.active) return;
  const names = new Set(item.normalizedAliases);
  for (const current of latestItems(rows)) {
    if (!current.active || current.category === item.category && current.id === item.id) continue;
    const currentAliases = current.normalizedAliases || [current.id, current.name, ...current.aliases]
      .map(normalizeCatalogAlias);
    if (currentAliases.some((alias) => names.has(alias))) {
      throw new ApiError(409, 'Alias ja associado a outro item ativo do Catalogo Mestre');
    }
  }
}

function buildProfileConfiguration(current, item) {
  if (!current || !Array.isArray(current.fields)) {
    throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  }
  const target = CATEGORY_FIELDS[item.category];
  const submittedAliases = new Set(item.normalizedAliases);
  if (item.active) {
    for (const field of current.fields) {
      for (const option of field.options) {
        if (option.id === item.id && field.key === target) continue;
        const names = [option.id, option.label, ...(option.aliases || [])]
          .map(normalizeCatalogAlias);
        if (names.some((name) => submittedAliases.has(name))) {
          throw new ApiError(409, 'Alias ja associado ao catalogo funcional publicado');
        }
      }
    }
  }
  const fields = current.fields.map((field) => {
    const value = plain(field);
    const options = value.options.map((option) => plain(option));
    const conflictingField = field.key !== target && options.some((option) => option.id === item.id);
    if (conflictingField) throw new ApiError(409, 'Identificador canonico ja representa outro conceito');
    if (field.key !== target) return { ...value, options };
    const filtered = options.filter((option) => option.id !== item.id);
    if (item.active) filtered.push({ id: item.id, label: item.name, aliases: item.aliases });
    return { ...value, options: filtered.sort((left, right) => left.id.localeCompare(right.id)) };
  });
  if (!fields.some((field) => field.key === target)) {
    throw new ApiError(503, 'Categoria sem campo funcional publicado');
  }
  const before = JSON.stringify(current.fields.map((field) => plain(field)));
  const after = JSON.stringify(fields);
  return { changed: before !== after, fields, geographyWeights: plain(current.geographyWeights) || null };
}

async function publishMasterCatalogItem(actor, category, id, input, now = new Date()) {
  const item = normalizeRequest(actor, category, id, input, now);
  const account = await User.findOne({ _id: actor.id, role: 'admin', status: 'active' }).select('_id');
  if (!account) throw new ApiError(403, 'Conta administrativa inativa ou inexistente');
  await Promise.all([MasterCatalogItem.init(), MatchProfileConfiguration.init()]);
  const [sameId, publishedRows, currentConfiguration] = await Promise.all([
    MasterCatalogItem.findOne({ id, state: 'published' }).sort({ revision: -1 }),
    MasterCatalogItem.find({ state: 'published' }).sort({ revision: -1 }),
    MatchProfileConfiguration.findOne().sort({ version: -1 }),
  ]);
  if (sameId && sameId.category !== category) {
    throw new ApiError(409, 'Identificador canonico ja utilizado em outra categoria');
  }
  const current = publishedRows.find((row) => row.category === category && row.id === id) || sameId;
  if (current && sameItem(current, item)) return current;
  assertAliasOwnership(item, publishedRows);
  const profile = buildProfileConfiguration(currentConfiguration, item);
  const profileVersion = currentConfiguration.version + (profile.changed ? 1 : 0);
  const revision = (current?.revision || 0) + 1;
  let created;
  try {
    created = await MasterCatalogItem.create({ ...item, revision, state: 'published',
      createdBy: actor.id, profileConfigurationVersion: profileVersion, cacheInvalidatedAt: now,
      recalculation: { status: 'scheduled', scheduledFor: now } });
    if (profile.changed) {
      await MatchProfileConfiguration.create({ version: profileVersion, fields: profile.fields,
        geographyWeights: profile.geographyWeights, createdBy: actor.id });
    }
    return created;
  } catch (error) {
    if (created?._id) await MasterCatalogItem.deleteOne({ _id: created._id });
    if (error.code === 11000) {
      throw new ApiError(409, 'Catalogo Mestre alterado concorrentemente; tente novamente');
    }
    throw error;
  }
}

module.exports = { publishMasterCatalogItem, normalizeRequest, normalizeCatalogAlias,
  buildProfileConfiguration, assertAliasOwnership };
