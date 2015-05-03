module.exports = createCFG

const escontrol = require('escontrol')
const espree    = require('espree')
const d3        = require('d3')

const parseOpts = {
  loc: true,
  ecmaFeatures: {
    arrowFunctions: true,
    blockBindings: true,
    destructuring: true,
    regexYFlag: true,
    regexUFlag: true,
    templateStrings: true,
    binaryLiterals: true,
    octalLiterals: true,
    unicodeCodePointEscapes: true,
    defaultParams: true,
    restParams: true,
    forOf: true,
    objectLiteralComputedProperties: true,
    objectLiteralShorthandMethods: true,
    objectLiteralShorthandProperties: true,
    objectLiteralDuplicateProperties: true,
    generators: true,
    spread: true,
    classes: true,
    modules: false,
    jsx: false,
    globalReturn: true
  }
}

function createCFG(code, ready) {
  let cfg = null
  try {
    cfg = escontrol(espree.parse(code, parseOpts))
  } catch(err) {
    return ready(err)
  }

  return iterate()

  function iterate() {
    try {
      let times = 0
      while (cfg.advance()) {
        if (++times > 1000) {
          return setImmediate(iterate)
        }
      }
      return ready(null, cfg)
    } catch(err) {
      return ready(err)
    }
  }
}

function createObjectGraph(code) {

}
