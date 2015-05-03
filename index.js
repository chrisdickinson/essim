const generateCFG      = require('./lib/analyzer.js')
const initializeEditor = require('./lib/editor.js')
const graphlibDot      = require('graphlib-dot')
const d3dagre          = require('dagre-d3')
const through          = require('through')
const d3               = require('d3')

initializeEditor(document.body)
  .pipe(through(oncode))

const render = d3dagre.render()
const svg = d3.select('body').append('svg')

const inner =
svg
  .attr('width', '50%')
  .attr('height', window.innerHeight)
  .append('g')
    .call(d3.behavior.zoom().scaleExtent([0.125, 1.25]).on('zoom', onzoom))
  .append('g')

window.onresize = function() {
  svg.attr('height', window.innerHeight)
}

function oncode(code) {
  generateCFG(code, function(err, cfg) {
    if (err) {
      console.log(err.stack)
      return
    }
    const results = graphlibDot.read(cfg.toDot())
    if (!results.graph().hasOwnProperty('marginx') &&
        !results.graph().hasOwnProperty('marginy')) {
      results.graph().marginx = 20
      results.graph().marginy = 20
    }

    results.graph().transition = function(selection) {
      return selection.transition().duration(500)
    }

    inner.call(render, results)
  })
}

function onzoom() {
  inner.attr(
    'transform',
    `translate(${d3.event.translate})scale(${d3.event.scale})`
  )
}
