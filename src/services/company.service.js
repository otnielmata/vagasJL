const Company = require('../models/company.model');
const ApiError = require('../errors/api.error');

const REQUIRED_FIELDS = Object.freeze([
  'legalName', 'responsibleName', 'email', 'city', 'state', 'country',
]);
const OPTIONAL_TEXT_FIELDS = Object.freeze(['tradeName', 'description', 'segment']);
const OPTIONAL_URL_FIELDS = Object.freeze(['website', 'linkedinUrl']);
const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_TEXT_FIELDS,
  ...OPTIONAL_URL_FIELDS, 'phone']);

function invalid() {
  throw new ApiError(400, 'Dados de empresa invalidos');
}

function text(value, maxLength, required = false) {
  if (!required && (value === undefined || value === null)) return null;
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalid();
  return normalized;
}

function normalizeUrl(value) {
  const normalized = text(value, 2048);
  if (normalized === null) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname ||
        parsed.username || parsed.password) invalid();
  } catch (error) {
    invalid();
  }
  return normalized;
}

function normalizeCompany(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !ALLOWED_FIELDS.has(key))) invalid();
  const data = {};
  for (const field of REQUIRED_FIELDS) {
    data[field] = text(input[field], field === 'email' ? 254 : 200, true);
  }
  data.email = data.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) invalid();
  for (const field of OPTIONAL_TEXT_FIELDS) {
    data[field] = text(input[field], field === 'description' ? 5000 : 200);
  }
  for (const field of OPTIONAL_URL_FIELDS) data[field] = normalizeUrl(input[field]);
  data.phone = text(input.phone, 40);
  if (data.phone !== null && (data.phone.length < 6 || !/^[+\d\s().-]+$/.test(data.phone))) invalid();
  return data;
}

async function registerCompany(user, input) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem cadastrar empresas');
  const data = normalizeCompany(input);
  await Company.init();
  if (await Company.findOne({ email: data.email, deletedAt: null })) {
    throw new ApiError(409, 'Email corporativo ja cadastrado');
  }
  try {
    return await Company.create({ ...data, status: 'pending', registeredBy: user.id });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Email corporativo ja cadastrado');
    throw error;
  }
}

module.exports = { registerCompany };
