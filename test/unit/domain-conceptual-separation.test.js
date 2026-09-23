require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const Vacancy = require('../../src/models/vacancy.model');

test('keeps candidate registration, technical profile and official engagement conceptually separate', () => {
  assert.equal(Candidate.schema.path('matchProfile'), undefined);
  assert.equal(Candidate.schema.path('engagement'), undefined);
  assert.equal(CandidateMatchProfile.schema.path('candidate').options.ref, 'Candidate');
  assert.equal(CandidateMatchProfile.schema.path('values').instance, 'Embedded');
});

test('keeps company data separate from linked recruiter accounts', () => {
  assert.equal(Company.schema.path('users'), undefined);
  assert.equal(Company.schema.path('recruiters'), undefined);
  assert.equal(CompanyUser.schema.path('company').options.ref, 'Company');
  assert.equal(CompanyUser.schema.path('user').options.ref, 'User');
});

test('owns opportunity and canonical requirements in vacancy without candidate personal data', () => {
  assert.equal(Vacancy.schema.path('matchProfile').instance, 'Embedded');
  assert.equal(Vacancy.schema.path('matchProfile.values').instance, 'Embedded');
  assert.equal(Vacancy.schema.path('candidateEmail'), undefined);
  assert.equal(Vacancy.schema.path('candidatePhone'), undefined);
});

test('stores Match as references, result, explanation and algorithm version only', () => {
  assert.equal(MatchEvaluation.schema.path('candidate').options.ref, 'Candidate');
  assert.equal(MatchEvaluation.schema.path('vacancy').options.ref, 'Vacancy');
  assert.equal(MatchEvaluation.schema.path('percentage').options.immutable, true);
  assert.equal(MatchEvaluation.schema.path('explanation').options.required, true);
  assert.equal(MatchEvaluation.schema.path('algorithmVersion').options.immutable, true);
  for (const field of ['name', 'email', 'phone', 'company', 'description']) {
    assert.equal(MatchEvaluation.schema.path(field), undefined);
  }
});
