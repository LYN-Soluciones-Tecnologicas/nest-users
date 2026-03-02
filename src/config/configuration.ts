export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lyn_tenders',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'local',
    jinaApiKey: process.env.JINA_API_KEY || '',
  },
  placsp: {
    baseUrl:
      process.env.PLACSP_BASE_URL ||
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643',
    atomFile:
      process.env.PLACSP_ATOM_FILE ||
      'licitacionesPerfilesContratanteCompleto3.atom',
    menoresUrl:
      process.env.PLACSP_MENORES_URL ||
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1143',
  },
  euskadi: {
    apiUrl:
      process.env.EUSKADI_API_URL ||
      'https://opendata.euskadi.eus/webopd00-apicontract/es',
  },
  company: {
    name: process.env.COMPANY_NAME || 'LYN Soluciones Tecnológicas',
    cpvCodes: (process.env.COMPANY_CPV_CODES || '72000000').split(','),
  },
});
