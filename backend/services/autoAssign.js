const db = require('../db');
function attemptAutoAssign(io) {
  return 0; // Disabled by user preference for Task Pool
}

module.exports = (io) => {
  console.log(`🤖 Auto-Assign service is disabled in favor of Manual Task Pool`);
  return { attemptAutoAssign };
};
