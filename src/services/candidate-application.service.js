const crypto = require('node:crypto');
const Candidate = require('../models/candidate.model');
const Vacancy = require('../models/vacancy.model');
const ApplicationReferral = require('../models/application-referral.model');
const { getLatestMatchEvaluation } = require('./match-evaluation-audit.service');
const { normalizeApplicationChannel, safeChannelReference } = require('../config/application-channel');
const ApiError = require('../errors/api.error');

const OBJECT_ID = /^[a-f\d]{24}$/i;

function safeChannel(channel) {
  return channel.type === 'email'
    ? { type: 'email', address: channel.value, uri: `mailto:${channel.value}` }
    : { type: 'https_url', url: channel.value };
}

function matchAdvisory(evaluation) {
  return {
    blocksApplication: false,
    eligibility: evaluation?.eligibility ? {
      eligible: evaluation.eligibility.eligible ?? null,
      reason: evaluation.eligibility.reason || null,
    } : null,
  };
}

async function referCandidateToApplication(actor, vacancyId, now = new Date()) {
  if (actor?.role !== 'candidate') throw new ApiError(403, 'Apenas candidatos podem solicitar candidatura');
  if (typeof vacancyId !== 'string' || !OBJECT_ID.test(vacancyId)) {
    throw new ApiError(400, 'Identificador da vaga invalido');
  }
  const candidate = await Candidate.findOne({ user: actor.id, deletedAt: null }).select('_id status');
  if (!candidate) throw new ApiError(404, 'Cadastro de candidato atual nao encontrado');
  if (candidate.status === 'blocked') throw new ApiError(403, 'Candidato bloqueado nao pode solicitar candidatura');

  const vacancy = await Vacancy.findById(vacancyId.toLowerCase()).select('+deletedAt');
  if (!vacancy || vacancy.deletedAt || ['removed', 'rejected'].includes(vacancy.status)) {
    throw new ApiError(404, 'Vaga nao encontrada');
  }
  if (vacancy.status !== 'active' || vacancy.expiresAt && new Date(vacancy.expiresAt) <= now) {
    throw new ApiError(409, 'Vaga indisponivel para candidatura');
  }
  if (!vacancy.applicationChannel) {
    throw new ApiError(409, 'Canal oficial de candidatura nao configurado');
  }

  let channel;
  try {
    channel = normalizeApplicationChannel(vacancy.applicationChannel.toObject?.() ||
      vacancy.applicationChannel);
  } catch (error) {
    if ([400, 503].includes(error.statusCode)) {
      throw new ApiError(503, 'Canal oficial de candidatura configurado de forma insegura');
    }
    throw error;
  }

  const fingerprint = crypto.createHash('sha256').update(`${channel.type}:${channel.value}`).digest('hex');
  await ApplicationReferral.init();
  let referral;
  try {
    referral = await ApplicationReferral.findOneAndUpdate(
      { candidate: candidate._id, vacancy: vacancy._id, channelFingerprint: fingerprint },
      { $setOnInsert: { candidate: candidate._id, vacancy: vacancy._id,
        vacancyOrigin: vacancy.origin, state: 'redirect_ready', channelType: channel.type,
        channelReference: safeChannelReference(channel), channelFingerprint: fingerprint,
        privacyScope: 'minimal_referral_event', referredAt: now } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code === 11000) {
      referral = await ApplicationReferral.findOne({ candidate: candidate._id, vacancy: vacancy._id,
        channelFingerprint: fingerprint });
    } else throw error;
  }
  if (!referral) throw new ApiError(503, 'Nao foi possivel auditar o encaminhamento');
  const evaluation = await getLatestMatchEvaluation(candidate._id, vacancy._id);
  return {
    state: 'redirect_ready',
    applicationConfirmed: false,
    channel: safeChannel(channel),
    referral: { id: String(referral._id), recordedAt: referral.referredAt },
    matchAdvisory: matchAdvisory(evaluation),
  };
}

module.exports = { referCandidateToApplication, safeChannel, matchAdvisory };
