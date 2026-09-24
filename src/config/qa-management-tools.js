const QA_MANAGEMENT_FIELD_LABEL = 'Ferramentas de QA e Gestão de Testes';

const PROPOSED_QA_MANAGEMENT_TOOLS = Object.freeze([
  { id: 'testrail', label: 'TestRail', aliases: [] },
  { id: 'xray', label: 'Xray', aliases: ['Xray Test Management'] },
  { id: 'zephyr', label: 'Zephyr', aliases: ['SmartBear Zephyr'] },
  { id: 'azure_devops', label: 'Azure DevOps', aliases: ['Azure DevOps Test Plans'] },
  { id: 'testlink', label: 'TestLink', aliases: [] },
  { id: 'qtest', label: 'qTest', aliases: ['Tricentis qTest'] },
  { id: 'hp_alm', label: 'HP ALM', aliases: ['HPE ALM', 'Quality Center'] },
]);

module.exports = { QA_MANAGEMENT_FIELD_LABEL, PROPOSED_QA_MANAGEMENT_TOOLS };
