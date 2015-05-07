const analyze          = require('./lib/analyzer.js')
const initializeEditor = require('./lib/editor.js')
const graphlibDot      = require('graphlib-dot')
const d3dagre          = require('dagre-d3')
const through          = require('through')
const d3               = require('d3')

initializeEditor(document.body)
  .pipe(through(oncode))

const renderFlow = d3dagre.render()
const renderObject = d3dagre.render()
const svg = d3.select('body').append('svg')
const playPause = document.createElement('button')
let playing = false
let disabled = false
let lastGoodCode = null
let objectGraphStream = null

playPause.setAttribute('id', 'play-pause')
playPause.textContent = '     '
playPause.addEventListener('click', onclickbtn)
document.body.appendChild(playPause)

const zoomLayer =
svg
  .attr('width', '50%')
  .attr('height', window.innerHeight)
  .append('g')
    .call(d3.behavior.zoom().scaleExtent([0.125, 1.25]).on('zoom', onzoom))

zoomLayer
  .append('rect')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('fill', '#666676')

const flowGraph =
zoomLayer
  .append('g')
    .attr('id', 'flow-graph')

const objectGraph =
zoomLayer
  .append('g')
    .attr('id', 'object-graph')

window.onresize = function() {
  svg.attr('height', window.innerHeight)
}

function oncode(code) {
  if (objectGraphStream) {
    objectGraphStream.stop()
    objectGraphStream = null
  }
  analyze.createCFG(code, function(err, cfg) {
    if (err) {
      document.body.classList.add('play-disabled')
      disabled = true
      return
    }
    disabled = false
    document.body.classList.remove('play-disabled')
    lastGoodCode = code
    const results = graphlibDot.read(cfg.toDot())
    if (!results.graph().hasOwnProperty('marginx') &&
        !results.graph().hasOwnProperty('marginy')) {
      results.graph().marginx = 20
      results.graph().marginy = 20
    }

    results.graph().transition = function(selection) {
      return selection.transition().duration(500)
    }

    flowGraph.call(renderFlow, results)
  })
}

function onzoom() {
  flowGraph.attr(
    'transform',
    `translate(${d3.event.translate})scale(${d3.event.scale})`
  )
  objectGraph.attr(
    'transform',
    `translate(${d3.event.translate})scale(${d3.event.scale})`
  )
}

function onclickbtn(ev) {
  ev.preventDefault()
  if (disabled) {
    return
  }
  playing = !playing
  if (!playing) {
    objectGraph.selectAll('*').remove()
    document.body.classList.remove('playing')
    return
  } else {
    document.body.classList.add('playing')
  }

  objectGraphStream = analyze.createObjectGraph(lastGoodCode)
  objectGraph.selectAll('*').remove()

  objectGraphStream.on('data', function({vertices, edges, builtins, root}) {
    const output = ['digraph {']
    let ID = 1;
    const mapping = new Map()
    for (const vertex of vertices) {
      const id = ID++
      mapping.set(vertex, id)
      output.push(id + ` [label=${
        JSON.stringify(
          vertex.stack || vertex.toparent ? 'Stack Item' :
          vertex.root ? 'Root' :
          vertex.classInfo ? vertex.classInfo() : 
          vertex.getName ? 'name: ' + vertex.getName() : '???'
        )
      }]`)
    }
    for (const edge of edges) {
      if (!mapping.get(edge[0]) || !mapping.get(edge[1])) {
        continue
      }

      output.push(`${mapping.get(edge[0])} -> ${mapping.get(edge[1])} [label=${
        JSON.stringify(edge[2])
      }]`)
    }
    output.push('}')
    const results = graphlibDot.read(output.join('\n'))
    if (!results.graph().hasOwnProperty('marginx') &&
        !results.graph().hasOwnProperty('marginy')) {
      results.graph().marginx = 20
      results.graph().marginy = 20
    }

    results.graph().transition = function(selection) {
      return selection.transition().duration(500)
    }

    objectGraph.call(renderObject, results)

  })
}
