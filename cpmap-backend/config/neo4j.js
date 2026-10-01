const neo4j = require('neo4j-driver');

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

// Aura uses neo4j+s:// — the driver handles TLS automatically
const isAura = NEO4J_URI.startsWith('neo4j+s://') || NEO4J_URI.startsWith('bolt+s://');

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  {
    maxConnectionLifetime: 3 * 60 * 60 * 1000,
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000,
  }
);

let connected = false;

function maskUri(uri) {
  return uri.replace(/\/\/([^:@/]+)(:[^@/]+)?@/, '//$1:***@');
}

async function verifyConnectivity() {
  try {
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
      await session.run('RETURN 1 AS ok');
    } finally {
      await session.close();
    }
    connected = true;
    console.log(`✅ Neo4j connected (${isAura ? 'Aura' : 'local'}: ${maskUri(NEO4J_URI)}, db=${NEO4J_DATABASE})`);
    return true;
  } catch (err) {
    connected = false;
    console.error('❌ Neo4j connection error:', err.message);
    if (isAura) {
      console.error('   Check NEO4J_URI (neo4j+s://…), NEO4J_USER, NEO4J_PASSWORD, and NEO4J_DATABASE in .env');
    }
    return false;
  }
}

function getSession() {
  return driver.session({ database: NEO4J_DATABASE });
}

function isConnected() {
  return connected;
}

async function closeDriver() {
  await driver.close();
}

module.exports = {
  driver,
  getSession,
  verifyConnectivity,
  isConnected,
  closeDriver,
  NEO4J_URI,
  NEO4J_DATABASE,
  isAura,
};
