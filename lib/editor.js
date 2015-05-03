module.exports = init

const frameDebounce = require('frame-debounce')
const getSize       = require('element-size')
const CodeMirror    = require('codemirror')
const debounce      = require('debounce')
const through       = require('through')

require('./cm-js.js')(CodeMirror)

function init(el) {
  const targetEl = document.createElement('div')
  el.appendChild(targetEl)
  targetEl.classList.add('editor')
  const editor = new CodeMirror(targetEl, {
    container: targetEl,
    theme: 'dracula',
    mode: 'javascript',
    lineNumbers: true,
    matchBrackets: true,
    indentWithTabs: false,
    styleActiveLine: true,
    showCursorWhenSelecting: true,
    viewportMargin: Infinity,
    keyMap: 'default',
    indentUnit: 2,
    tabSize: 2,
    value: ''
  })

  window.xxx = CodeMirror
  editor.addKeyMap({
    'Tab': _ => editor.execCommand('insertSoftTab')
  })

  editor.on('change', debounce(_ => {
    stream.queue(editor.getValue() || '')
  }))

  const stream = through()

  window.addEventListener('resize', frameDebounce(resize))
  setTimeout(resize)

  return stream

  function resize(w, h) {
    if (w && h) return editor.setSize(w, h)
    let size = getSize(el)
    editor.setSize(w || size[0], h || size[1])
  }
}
