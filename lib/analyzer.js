module.exports = {createCFG, createObjectGraph}

const escontrol = require('escontrol')
const through   = require('through')
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
          return setTimeout(iterate)
        }
      }
      return ready(null, cfg)
    } catch(err) {
      return ready(err)
    }
  }
}

function createObjectGraph(code) {
  let cfg = null
  const stream = through()
  const vertices = new Set()
  const edges = new Set()
  const fromVia = new WeakMap()
  let cancelled = false
  let stack = {stack: true}
  let root = {root: true}
  let isBuiltin = true
  let sawChange = true
  let sawGCEvent = false

  fromVia.set(root, new Map())
  fromVia.set(stack, new Map())
  const builtins = new Set()
  try {
    cfg = escontrol(espree.parse(code, parseOpts), {
      onvalue     : onvalue,
      onpushvalue : onpushvalue,
      onpopvalue  : onpopvalue,
      onlink      : onlink,
      onunlink    : onunlink,
      oncalled    : oncalled
    })
  } catch(err) {
    setTimeout(_ => stream.emit('error', err))
  }
  isBuiltin = false
  vertices.add(stack)
  vertices.add(root)

  setTimeout(iterate)

  stream.stop = stop
  cfg.builtins().getprop('[[ArrayProto]]').value().classInfo = _ => '[[ArrayProto]]'
  cfg.builtins().getprop('[[ObjectProto]]').value().classInfo = _ => '[[ObjectProto]]'
  cfg.builtins().getprop('[[StringProto]]').value().classInfo = _ => '[[StringProto]]'
  cfg.builtins().getprop('[[RegExpProto]]').value().classInfo = _ => '[[RegExpProto]]'
  cfg.builtins().getprop('[[NumberProto]]').value().classInfo = _ => '[[NumberProto]]'
  cfg.builtins().getprop('[[FunctionProto]]').value().classInfo = _ => '[[FunctionProto]]'
  cfg.global().classInfo = _ => 'Global Scope'
  return stream

  function iterate() {
    if (cancelled) return
    sawChange = false
    while (cfg.advance()) {
      if (sawChange) {
        if (sawGCEvent) gc(cfg.global())
        stream.queue({vertices, edges})
        return setTimeout(iterate, 1000)
      }
    }

    stream.queue({vertices, edges, builtins})
    stream.queue(null)
  }

  function stop() {
    cancelled = true
  }

  function onvalue(value) {
    sawChange = true
    fromVia.set(value, new Map())
    if (isBuiltin) {
      builtins.add(value)
      return
    }
    vertices.add(value)
    if (value.isEither()) {
      for (const xs of value._outcomes) {
        onvalue(xs)
        onlink(value, xs, '[[maybe]]')
      }
    }
  }

  function onpushvalue(value) {
    sawChange = true
    let next = {parent: stack, value: value, toparent: null, tovalue: null}
    next.toparent = [stack, next, '']
    next.tovalue = [next, value, '']
    edges.add(next.toparent)
    edges.add(next.tovalue)
    vertices.add(next)
    stack = next
  }

  function onpopvalue(value) {
    sawChange = true
    let prev = stack
    if (!stack.parent) {
      throw new Error('cannot pop')
    }
    stack = stack.parent
    edges.delete(prev.toparent)
    edges.delete(prev.tovalue)
    vertices.delete(prev)
  }

  function onlink(from, to, via) {
    sawChange = true
    from = from || root
    to = to || root
    if (isBuiltin) {
      if (from.root || to.root) {
        vertices.add(from)
        vertices.add(to)
      }
    } else {
      if (builtins.has(from) || builtins.has(to)) {
        vertices.add(from)
        vertices.add(to)
      }
    }
    let tuple = [from, to, via]
    fromVia.get(from).set(via, tuple)
    edges.add(tuple)
  }

  function oncalled() {
    sawGCEvent = new Error().stack
  }

  function onunlink(from, to, via) {
    sawChange = true
    from = from || root
    to = to || root
    edges.delete(fromVia.get(from).get(via))
    fromVia.get(from).delete(via)
  }

  function gc(root) {
    const trace = sawGCEvent
    sawGCEvent = false

    const seenValues = new Set()
    const marked = new WeakSet()
    for (const obj of iterateObjects(root, seenValues)) {
      marked.add(obj)
    }
    let currentStack = stack
    while (currentStack) {
      if (currentStack.value && currentStack.value.names) {
        const seenValues = new Set()
        for (const obj of iterateObjects(currentStack.value, seenValues)) {
          marked.add(obj)
        }
      }
      currentStack = currentStack.parent
    }
    marked.add(root)
    for (const obj of vertices) {
      if (!marked.has(obj) && !obj.stack && !obj.toparent) {
        console.log('DELETE obj', obj, cfg.stackInfo(), trace)
        vertices.delete(obj)
      }
    }
  }

  function iterateObjects(obj, seenValues) {
    const stack = [obj.names()]
    seenValues.add(null)
    return {
      [Symbol.iterator]() {
        return this
      },
      next() {
        for (const name of stack[0]) {
          let value = name
          if (name.value) {
            value = name.value()
          }
          if (seenValues.has(value)) {
            continue
          }
          seenValues.add(value)
          stack.unshift(value.isEither() ? value._outcomes.values() : value.names())
          return {
            value: value,
            done: false
          }
        }
        stack.shift()
        if (!stack.length) {
          return {
            done: true,
            value: undefined
          }
        }
        return this.next()
      }
    }
  }
}
