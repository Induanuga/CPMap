const careerGraphService = require('../services/careerGraphService');

async function syncCareerPathToNeo4j() {
  await careerGraphService.rebuildGraph();
}

async function removeCareerPathFromNeo4j() {
  await careerGraphService.rebuildGraph();
}

async function syncAllToNeo4j() {
  return careerGraphService.rebuildGraph();
}

module.exports = { syncCareerPathToNeo4j, removeCareerPathFromNeo4j, syncAllToNeo4j };
