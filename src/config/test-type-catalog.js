const INITIAL_TEST_TYPES = Object.freeze([
  { id: 'testes-funcionais', label: 'Testes Funcionais' },
  { id: 'regressao', label: 'Regressão' },
  { id: 'testes-exploratorios', label: 'Testes Exploratórios' },
  { id: 'testes-de-api', label: 'Testes de API' },
  { id: 'uat', label: 'UAT' },
  { id: 'performance', label: 'Performance' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'acessibilidade', label: 'Acessibilidade' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'e2e', label: 'E2E' },
  { id: 'integracao', label: 'Integração' },
  { id: 'bdd', label: 'BDD' },
]);

module.exports = { INITIAL_TEST_TYPES };
