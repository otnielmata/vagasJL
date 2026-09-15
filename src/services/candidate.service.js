const User = require('../models/user.model');
const Candidate = require('../models/candidate.model');
const ApiError = require('../errors/api.error');
const studentValidation = require('./student-validation.service');
const { UNKNOWN, CANDIDATE_STATUS, PROFILE_FIELDS } = require('../config/candidate');

async function registerCandidate(userId, input) {
  const user = await User.findById(userId).select('email status');
  if (!user || user.status !== 'active') throw new ApiError(401, 'Usuario nao autenticado ou inativo');

  const email = input.email.trim().toLowerCase();
  if (email !== user.email) throw new ApiError(400, 'O email deve corresponder a conta autenticada');

  try {
    await Candidate.init();
    if (await Candidate.findOne({ $or: [{ user: user._id }, { email }] })) {
      throw new ApiError(409, 'Ja existe um candidato cadastrado para este usuario ou email');
    }

    const validation = await studentValidation.validateStudent(user.email, input.purchaseCode);
    if (validation === 'rejected') throw new ApiError(422, 'Usuario nao autorizado na base de alunos');
    if (!['pending', 'verified'].includes(validation)) throw new Error('Resultado de validacao de aluno desconhecido');

    const profile = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, input[field] ?? UNKNOWN]));
    const candidate = new Candidate({ user: user._id, name: input.name, email, ...profile });
    if (validation === 'verified') candidate.status = CANDIDATE_STATUS.INCOMPLETE_PROFILE;
    return await candidate.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um candidato cadastrado para este usuario ou email');
    }
    if (error.name === 'ValidationError') throw new ApiError(400, 'Dados de candidato invalidos');
    throw error;
  }
}

async function revalidatePendingCandidate(candidateId) {
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) throw new ApiError(404, 'Candidato nao encontrado');
  if (candidate.status !== CANDIDATE_STATUS.PENDING_VALIDATION) {
    throw new ApiError(409, 'Somente candidatos pendentes podem ser revalidados');
  }
  const validation = await studentValidation.validateStudent(candidate.email);
  if (validation === 'pending') return candidate;
  if (validation === 'rejected') throw new ApiError(422, 'Usuario nao autorizado na base de alunos');
  if (validation !== 'verified') throw new Error('Resultado de validacao de aluno desconhecido');

  const updated = await Candidate.findOneAndUpdate(
    { _id: candidate._id, status: CANDIDATE_STATUS.PENDING_VALIDATION },
    { $set: { status: CANDIDATE_STATUS.INCOMPLETE_PROFILE } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(409, 'O candidato foi alterado durante a validacao');
  return updated;
}

module.exports = { registerCandidate, revalidatePendingCandidate };
