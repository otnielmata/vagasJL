require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const { updateCandidate } = require('../../src/services/candidate.service');
const {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../../src/config/candidate');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherUserId = '6512f1e2b3a1c2d3e4f5a6b8';

function candidateDocument(overrides = {}) {
  return Candidate.hydrate({
    _id: candidateId,
    user: ownerId,
    name: 'Maria Silva',
    photoUrl: 'https://example.com/maria.png',
    email: 'maria@example.com',
    phone: '+55 11 99999-9999',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brasil',
    linkedinUrl: 'https://linkedin.com/in/maria',
    githubUrl: 'https://github.com/maria',
    portfolioUrl: 'https://maria.example.com',
    professionalSummary: 'Profissional de testes',
    availability: 'available',
    status: CANDIDATE_STATUS.ACTIVE,
    eligibility: {
      status: ELIGIBILITY_STATUS.APPROVED,
      method: ELIGIBILITY_METHOD.EMAIL,
      source: ELIGIBILITY_SOURCE.MONGODB,
      lastAttemptAt: new Date('2026-09-15T10:00:00.000Z'),
      approvedAt: new Date('2026-09-15T10:00:00.000Z'),
    },
    eligibilityHistory: [],
    createdAt: new Date('2026-09-15T09:00:00.000Z'),
    updatedAt: new Date('2026-09-15T11:00:00.000Z'),
    ...overrides,
  });
}

function isolateDirectUpdate(context, candidate = candidateDocument()) {
  const findById = context.mock.method(Candidate, 'findById', async () => candidate);
  const findOneAndUpdate = context.mock.method(
    Candidate,
    'findOneAndUpdate',
    async (_filter, operation) => {
      candidate.set(operation.$set);
      return candidate;
    }
  );
  const transaction = context.mock.method(Candidate.db, 'transaction', async () => {
    assert.fail('profile-only update must not start a transaction');
  });
  return { candidate, findById, findOneAndUpdate, transaction };
}

test('approved candidate becomes active after completing every minimum field', async (context) => {
  const candidate = candidateDocument({
    phone: UNKNOWN,
    city: UNKNOWN,
    state: UNKNOWN,
    country: UNKNOWN,
    professionalSummary: UNKNOWN,
    availability: UNKNOWN,
    status: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  });
  const { findOneAndUpdate } = isolateDirectUpdate(context, candidate);

  const result = await updateCandidate(candidateId, ownerId, 'candidate', {
    phone: '+55 11 98888-7777',
    city: 'Campinas',
    state: 'SP',
    country: 'Brasil',
    professionalSummary: 'QA com foco em automacao',
    availability: 'available',
  });

  assert.equal(result.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(result.city, 'Campinas');
  assert.equal(candidate.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(findOneAndUpdate.mock.calls[0].arguments[1].$set.status, CANDIDATE_STATUS.ACTIVE);
});

test('partial update changes only supplied fields and preserves a complete active profile', async (context) => {
  const { candidate, findOneAndUpdate, transaction } = isolateDirectUpdate(context);
  const originalCountry = candidate.country;
  const originalSummary = candidate.professionalSummary;

  const result = await updateCandidate(candidateId, ownerId.toUpperCase(), 'candidate', {
    phone: ' +55 11 90000-0000 ',
    city: ' Rio de Janeiro ',
  });

  assert.equal(result.phone, '+55 11 90000-0000');
  assert.equal(result.city, 'Rio de Janeiro');
  assert.equal(result.country, originalCountry);
  assert.equal(result.professionalSummary, originalSummary);
  assert.deepEqual(findOneAndUpdate.mock.calls[0].arguments[1].$set, {
    phone: '+55 11 90000-0000',
    city: 'Rio de Janeiro',
    status: CANDIDATE_STATUS.ACTIVE,
  });
  assert.equal(transaction.mock.callCount(), 0);
});

test('approved profile remains incomplete while a minimum field is UNKNOWN', async (context) => {
  isolateDirectUpdate(context, candidateDocument({
    country: UNKNOWN,
    status: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  }));
  const result = await updateCandidate(candidateId, ownerId, 'candidate', { city: 'Campinas' });
  assert.equal(result.status, CANDIDATE_STATUS.INCOMPLETE_PROFILE);
});

for (const eligibilityStatus of [ELIGIBILITY_STATUS.PENDING, ELIGIBILITY_STATUS.REJECTED]) {
  test(`complete profile stays pending when eligibility is ${eligibilityStatus}`, async (context) => {
    isolateDirectUpdate(context, candidateDocument({
      status: CANDIDATE_STATUS.PENDING_VALIDATION,
      eligibility: {
        status: eligibilityStatus,
        method: ELIGIBILITY_METHOD.EMAIL,
        source: ELIGIBILITY_SOURCE.MONGODB,
      },
    }));
    const result = await updateCandidate(candidateId, ownerId, 'candidate', { city: 'Campinas' });
    assert.equal(result.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  });
}

test('clearing a minimum field immediately removes active status', async (context) => {
  isolateDirectUpdate(context);
  const result = await updateCandidate(candidateId, ownerId, 'candidate', { phone: null });
  assert.equal(result.phone, UNKNOWN);
  assert.equal(result.status, CANDIDATE_STATUS.INCOMPLETE_PROFILE);
});

test('same normalized email does not reset eligibility or require a transaction', async (context) => {
  const { candidate, transaction } = isolateDirectUpdate(context);
  const result = await updateCandidate(candidateId, ownerId, 'candidate', {
    email: ' MARIA@Example.COM ',
  });
  assert.equal(result.email, 'maria@example.com');
  assert.equal(result.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(candidate.eligibility.status, ELIGIBILITY_STATUS.APPROVED);
  assert.equal(candidate.eligibilityHistory.length, 0);
  assert.equal(transaction.mock.callCount(), 0);
});

for (const status of [CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED]) {
  test(`${status} candidate cannot be edited or reactivated`, async (context) => {
    const { candidate, findOneAndUpdate } = isolateDirectUpdate(context, candidateDocument({ status }));
    const snapshot = candidate.toObject();
    await assert.rejects(
      updateCandidate(candidateId, ownerId, 'candidate', { phone: '+55 11 90000-0000' }),
      { statusCode: 409 }
    );
    assert.deepEqual(candidate.toObject(), snapshot);
    assert.equal(findOneAndUpdate.mock.callCount(), 0);
  });
}

test('candidate cannot edit another candidate', async (context) => {
  const { candidate, findOneAndUpdate } = isolateDirectUpdate(
    context,
    candidateDocument({ user: otherUserId })
  );
  const snapshot = candidate.toObject();
  await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', { city: 'Recife' }), {
    statusCode: 403,
  });
  assert.deepEqual(candidate.toObject(), snapshot);
  assert.equal(findOneAndUpdate.mock.callCount(), 0);
});

test('missing candidate returns 404 without writing', async (context) => {
  const { findOneAndUpdate } = isolateDirectUpdate(context, null);
  await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', { city: 'Recife' }), {
    statusCode: 404,
  });
  assert.equal(findOneAndUpdate.mock.callCount(), 0);
});

for (const [role, input] of [
  ['company', { city: 'Recife' }],
  ['admin', { city: 'Recife' }],
  ['candidate', {}],
  ['candidate', { status: CANDIDATE_STATUS.ACTIVE }],
  ['candidate', { phone: false }],
]) {
  test(`rejects role/input ${role}/${JSON.stringify(input)} before storage`, async (context) => {
    const findById = context.mock.method(Candidate, 'findById', async () => {
      assert.fail('invalid request must not query candidates');
    });
    await assert.rejects(updateCandidate(candidateId, ownerId, role, input), {
      statusCode: role === 'candidate' ? 400 : 403,
    });
    assert.equal(findById.mock.callCount(), 0);
  });
}

test('concurrent candidate change returns 409 without overwriting it', async (context) => {
  const { candidate, findOneAndUpdate } = isolateDirectUpdate(context);
  const snapshot = candidate.toObject();
  findOneAndUpdate.mock.mockImplementation(async () => null);
  await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', { city: 'Recife' }), {
    statusCode: 409,
  });
  assert.deepEqual(candidate.toObject(), snapshot);
});

for (const [failure, statusCode] of [
  [Object.assign(new Error('duplicate'), { code: 11000 }), 409],
  [Object.assign(new Error('invalid'), { name: 'ValidationError' }), 400],
]) {
  test(`maps profile persistence failure to ${statusCode}`, async (context) => {
    const { findOneAndUpdate } = isolateDirectUpdate(context);
    findOneAndUpdate.mock.mockImplementation(async () => { throw failure; });
    await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', { city: 'Recife' }), {
      statusCode,
    });
  });
}

function isolateEmailUpdate(context) {
  const candidate = candidateDocument();
  const user = User.hydrate({
    _id: ownerId,
    name: candidate.name,
    email: candidate.email,
    role: 'candidate',
    status: 'active',
  });
  const candidateSnapshot = candidate.toObject();
  const userSnapshot = user.toObject();
  const session = { testSession: true };
  const state = {
    candidate,
    user,
    candidateConflict: null,
    userConflict: null,
    candidateSaveError: null,
    userSaveError: null,
    commitError: null,
    committed: false,
    historyProjection: null,
  };

  context.mock.method(User, 'init', async () => User);
  context.mock.method(Candidate, 'init', async () => Candidate);

  let candidateLookupCount = 0;
  const candidateFindById = context.mock.method(Candidate, 'findById', () => {
    candidateLookupCount += 1;
    if (candidateLookupCount === 1) return Promise.resolve(state.candidate);
    return {
      select(projection) {
        state.historyProjection = projection;
        return this;
      },
      session: async (receivedSession) => {
        assert.equal(receivedSession, session);
        return state.candidate;
      },
    };
  });
  const userFindById = context.mock.method(User, 'findById', () => ({
    session: async (receivedSession) => {
      assert.equal(receivedSession, session);
      return state.user;
    },
  }));
  const userFindOne = context.mock.method(User, 'findOne', (filter) => ({
    session: async (receivedSession) => {
      assert.equal(receivedSession, session);
      state.userConflictFilter = filter;
      return state.userConflict;
    },
  }));
  const candidateFindOne = context.mock.method(Candidate, 'findOne', (filter) => ({
    session: async (receivedSession) => {
      assert.equal(receivedSession, session);
      state.candidateConflictFilter = filter;
      return state.candidateConflict;
    },
  }));
  const userSave = context.mock.method(user, 'save', async (options) => {
    assert.deepEqual(options, { session });
    if (state.userSaveError) throw state.userSaveError;
    return user;
  });
  const candidateSave = context.mock.method(candidate, 'save', async (options) => {
    assert.deepEqual(options, { session });
    if (state.candidateSaveError) throw state.candidateSaveError;
    return candidate;
  });

  function rollback() {
    state.candidate = Candidate.hydrate(candidateSnapshot);
    state.user = User.hydrate(userSnapshot);
  }

  const transaction = context.mock.method(Candidate.db, 'transaction', async (callback) => {
    try {
      await callback(session);
      if (state.commitError) throw state.commitError;
      state.committed = true;
    } catch (error) {
      rollback();
      throw error;
    }
  });

  return {
    state,
    session,
    candidateFindById,
    userFindById,
    userFindOne,
    candidateFindOne,
    userSave,
    candidateSave,
    transaction,
  };
}

test('email change atomically updates account and candidate and invalidates eligibility', async (context) => {
  const isolated = isolateEmailUpdate(context);
  const { state, transaction, userSave, candidateSave } = isolated;

  const result = await updateCandidate(candidateId, ownerId, 'candidate', {
    email: ' NEW.EMAIL@Example.COM ',
    phone: '+55 11 97777-6666',
  });

  assert.equal(state.committed, true);
  assert.equal(state.user.id, ownerId);
  assert.equal(state.user.email, 'new.email@example.com');
  assert.equal(state.candidate.email, 'new.email@example.com');
  assert.equal(state.candidate.phone, '+55 11 97777-6666');
  assert.equal(state.candidate.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  assert.equal(state.candidate.visibleToCompanies, false);
  assert.equal(state.candidate.eligibility.status, ELIGIBILITY_STATUS.PENDING);
  assert.equal(state.candidate.eligibility.method, ELIGIBILITY_METHOD.UNKNOWN);
  assert.equal(state.candidate.eligibility.source, ELIGIBILITY_SOURCE.PENDING);
  assert.equal(state.candidate.eligibility.approvedAt, null);
  assert.equal(state.candidate.eligibilityHistory.length, 1);
  assert.equal(state.candidate.eligibilityHistory[0].email, 'maria@example.com');
  assert.equal(state.candidate.eligibilityHistory[0].status, ELIGIBILITY_STATUS.APPROVED);
  assert.ok(state.candidate.eligibilityHistory[0].invalidatedAt instanceof Date);
  assert.equal(result.email, 'new.email@example.com');
  assert.equal(result.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  for (const field of ['user', 'eligibility', 'eligibilityHistory', 'createdAt', 'updatedAt']) {
    assert.equal(result[field], undefined);
  }
  assert.equal(state.historyProjection, '+eligibilityHistory');
  assert.equal(userSave.mock.callCount(), 1);
  assert.equal(candidateSave.mock.callCount(), 1);
  assert.deepEqual(transaction.mock.calls[0].arguments[1], {
    readPreference: 'primary',
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
});

for (const conflict of ['user', 'candidate']) {
  test(`${conflict} email conflict returns 409 and rolls back every requested field`, async (context) => {
    const isolated = isolateEmailUpdate(context);
    const { state, userSave, candidateSave } = isolated;
    state[`${conflict}Conflict`] = { _id: otherUserId };

    await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', {
      email: 'taken@example.com',
      city: 'Recife',
    }), { statusCode: 409 });

    assert.equal(state.committed, false);
    assert.equal(state.user.email, 'maria@example.com');
    assert.equal(state.candidate.email, 'maria@example.com');
    assert.equal(state.candidate.city, 'Sao Paulo');
    assert.equal(state.candidate.eligibilityHistory.length, 0);
    assert.equal(userSave.mock.callCount(), 0);
    assert.equal(candidateSave.mock.callCount(), 0);
  });
}

for (const stage of ['userSaveError', 'candidateSaveError', 'commitError']) {
  test(`${stage} rolls back user and candidate without returning success`, async (context) => {
    const isolated = isolateEmailUpdate(context);
    const { state } = isolated;
    const failure = new Error(`${stage} failure`);
    state[stage] = failure;

    await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', {
      email: 'new@example.com',
      city: 'Recife',
    }), (error) => error === failure);

    assert.equal(state.committed, false);
    assert.equal(state.user.email, 'maria@example.com');
    assert.equal(state.candidate.email, 'maria@example.com');
    assert.equal(state.candidate.city, 'Sao Paulo');
    assert.equal(state.candidate.status, CANDIDATE_STATUS.ACTIVE);
    assert.equal(state.candidate.eligibility.status, ELIGIBILITY_STATUS.APPROVED);
    assert.equal(state.candidate.eligibilityHistory.length, 0);
  });
}

test('duplicate index race during email transaction returns 409 and rolls back', async (context) => {
  const isolated = isolateEmailUpdate(context);
  const { state } = isolated;
  state.candidateSaveError = Object.assign(new Error('duplicate'), { code: 11000 });
  await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', {
    email: 'new@example.com',
  }), { statusCode: 409 });
  assert.equal(state.user.email, 'maria@example.com');
  assert.equal(state.candidate.email, 'maria@example.com');
});

test('MongoDB without transactions returns 503 before any write', async (context) => {
  const isolated = isolateEmailUpdate(context);
  const { state, transaction, userSave, candidateSave } = isolated;
  transaction.mock.mockImplementation(async () => {
    throw Object.assign(new Error('transactions unsupported'), { code: 20 });
  });
  await assert.rejects(updateCandidate(candidateId, ownerId, 'candidate', {
    email: 'new@example.com',
  }), { statusCode: 503 });
  assert.equal(state.user.email, 'maria@example.com');
  assert.equal(state.candidate.email, 'maria@example.com');
  assert.equal(userSave.mock.callCount(), 0);
  assert.equal(candidateSave.mock.callCount(), 0);
});
