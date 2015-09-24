'use babel'

import {TextEditor, Emitter, CompositeDisposable} from 'atom'

export default class EditorLinter {
  constructor(editor) {
    if (!(editor instanceof TextEditor)) {
      throw new Error('Given editor is not really an editor')
    }

    this.editor = editor
    this.emitter = new Emitter()
    this.messages = new Set()
    this.gutterMarkers = new WeakMap()
    this.editorMarkers = new WeakMap()
    this.gutter = null
    this.subscriptions = new CompositeDisposable

    this.subscriptions.add(atom.config.observe('linter.underlineIssues', underlineIssues =>
      this.underlineIssues = underlineIssues
    ))
    this.subscriptions.add(this.editor.onDidDestroy(() =>
      this.destroy()
    ))
    this.subscriptions.add(this.editor.onDidSave(() =>
      this.emitter.emit('should-lint', false)
    ))
    this.subscriptions.add(this.editor.onDidChangeCursorPosition(({oldBufferPosition, newBufferPosition}) => {
      if (newBufferPosition.row !== oldBufferPosition.row) {
        this.emitter.emit('should-update-line-messages')
      }
      this.emitter.emit('should-update-bubble')
    }))
    this.subscriptions.add(atom.config.observe('linter.gutterEnabled', gutterEnabled => {
      this.gutterEnabled = gutterEnabled
      this.handleGutter()
    }))
    // Using onDidChange here 'cause the same function is invoked above
    this.subscriptions.add(atom.config.onDidChange('linter.gutterPosition', () =>
      this.handleGutter()
    ))
    this.subscriptions.add(this.onDidMessageAdd(message => {
      if (this.underlineIssues) {
        const marker = this.editor.markBufferRange(message.range, {invalidate: 'inside'})
        this.editorMarkers.set(message, marker)
        this.editor.decorateMarker(marker, {
          type: 'highlight',
          class: `linter-highlight ${message.class}`
        })
      }
      // TODO: Add the gutter decorations here too
    }))
    this.subscriptions.add(this.onDidMessageRemove(message => {
      if (this.editorMarkers.has(message)) {
        this.editorMarkers.get(message).destroy()
        this.editorMarkers.delete(message)
      }
      if (this.gutterMarkers.has(message)) {
        this.gutterMarkers.get(message).destroy()
        this.gutterMarkers.delete(message)
      }
    }))

    // Atom invokes the onDidStopChanging callback immediately on creation. So we wait a moment
    setImmediate(() => {
      this.subscriptions.add(this.editor.onDidStopChanging(() =>
        this.emitter.emit('should-lint', true)
      ))
    })
  }

  handleGutter() {
    const status = atom.config.get('linter.gutterEnabled')

    if (this.gutter !== null) this.removeGutter()
    if (status) this.addGutter()
  }

  addGutter() {
    const position = atom.config.get('linter.gutterPosition')
    this.gutter = this.editor.addGutter({
      name: 'linter',
      priority: position === 'Left' ? -100 : 100
    })
  }

  removeGutter() {
    if (this.gutter !== null) {
      this.gutter.destroy()
      this.gutter = null
    }
  }

  getMessages() {
    return this.messages
  }

  addMessage(message) {
    if (!this.messages.has(message)) {
      this.messages.add(message)
      this.emitter.emit('did-message-add', message)
      this.emitter.emit('did-message-change', {message, type: 'add'})
    }
  }

  removeMessage(message) {
    if (this.messages.has(message)) {
      this.messages.delete(message)
      this.emitter.emit('did-message-remove', message)
      this.emitter.emit('did-message-change', {message, type: 'remove'})
    }
  }

  lint(onChange = false) {
    this.emitter.emit('should-lint', onChange)
  }

  onDidMessageAdd(callback) {
    return this.emitter.on('did-message-add', callback)
  }

  onDidMessageRemove(callback) {
    return this.emitter.on('did-message-remove', callback)
  }

  onDidMessageChange(callback) {
    return this.emitter.on('did-message-change', callback)
  }

  onShouldUpdateBubble(callback) {
    return this.emitter.on('should-update-bubble', callback)
  }

  onShouldUpdateLineMessages(callback) {
    return this.emitter.on('should-update-line-messages', callback)
  }

  onShouldLint(callback) {
    return this.emitter.on('should-lint', callback)
  }

  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback)
  }

  destroy() {
    this.emitter.emit('did-destroy')
    this.dispose()
  }

  dispose() {
    if (this.editorMarkers.size) {
      this.editorMarkers.forEach(marker => marker.destroy())
      this.editorMarkers.clear()
    }
    if (this.gutterMarkers.size) {
      this.gutterMarkers.forEach(marker => marker.destroy())
      this.gutterMarkers.clear()
    }
    this.removeGutter()
    this.subscriptions.dispose()
    this.messages.clear()
    this.emitter.dispose()
  }
}