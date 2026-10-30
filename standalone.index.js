// Entry of dist/standalone: module.exports (UMD: SilverDecisions.Utils) is Utils,
// with Utils.log the loglevel root logger that index.js exports as `log`.
var Utils = require('./src/utils').Utils;
Utils.log = require('loglevel');
module.exports = Utils;
