!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Mute=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/*
 *	Copyright 2014 Matthieu Nicolas
 *
 *	This program is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU General Public License as published by
 *	the Free Software Foundation, either version 3 of the License, or
 * 	(at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU General Public License for more details.
 *
 *	You should have received a copy of the GNU General Public License
 *	along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var Mute = {
	Coordinator: _dereq_('./lib/coordinator'),
    SocketIOAdapter: _dereq_('./lib/socket-io-adapter'),
    AceEditorAdapter: _dereq_('./lib/ace-editor-adapter'),
    InfosUsersModule: _dereq_('./lib/infos-users'),
    PeerIOAdapter: _dereq_('./lib/peer-io-adapter')
};

module.exports = Mute;
},{"./lib/ace-editor-adapter":2,"./lib/coordinator":3,"./lib/infos-users":4,"./lib/peer-io-adapter":5,"./lib/socket-io-adapter":6}],2:[function(_dereq_,module,exports){
/*
 *	Copyright 2014 Matthieu Nicolas
 *
 *	This file is part of Mute-client.
 *
 *  Mute-client is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-client is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-client.  If not, see <http://www.gnu.org/licenses/>.
 */

var events = _dereq_('events');
var UndoManager = ace.require('ace/undomanager').UndoManager;

var INIT_MODE = -1;
var EDITOR_MODE = 0;
var HISTORY_MODE = 1;

var AceEditorAdapter = function (itemID, coordinator) {
	var aceEditorAdapter = this;
	var style = document.createElement('style');
	
	this.coordinator = coordinator;
	this.previousUndoManager = null;
	this.currentMarkers = [];
	this.userInfosChanged = false;
	this.mousePos = null;
	this.mode = INIT_MODE;
	this.flag = false;
	this.lastCursorIndex = 0;
	this.previousLine = 0;
	this.userInfosUpdateTimeout = null;
	this.disabled = false;

	Range = ace.require('ace/range').Range;

	style.type = 'text/css';
	style.innerHTML = '.editor { margin-left: 15px; margin-top: 15px; width: 1100px; height: 600px; overflow: visible }';
	document.getElementsByTagName('head')[0].appendChild(style);

	document.getElementById(itemID).className = 'editor';

	this.editor = ace.edit(itemID);

	this.editor.setTheme('ace/theme/dawn');
	this.editor.getSession().setTabSize(4);
	this.editor.getSession().setUseWrapMode(true);

	if(this.coordinator !== null) {
		this.coordinator.on('initEditor', function (data) {
			if(aceEditorAdapter.disabled === false) { 
				aceEditorAdapter.init(data);
			}
		});

		this.coordinator.on('coordinatorDisposed', function (data) {
			if(aceEditorAdapter.disabled === false) {
				aceEditorAdapter.onCoordinatorDisposedHandler(data);
			}
		});
	}

	this.editor.session.on('changeScrollTop', function (e) {
		if(aceEditorAdapter.disabled === false) { 
			aceEditorAdapter.emit('scroll', { topRow: aceEditorAdapter.editor.renderer.getScrollTopRow() });
    	}
    });

    this.editor.focus();
};

AceEditorAdapter.prototype.__proto__ = events.EventEmitter.prototype;

AceEditorAdapter.prototype.setInfosUsersModule = function (infosUsersModule) {
	var editor = this;

	this.infosUsersModule = infosUsersModule;
}

AceEditorAdapter.prototype.init = function (data) {
	// If we reconnect while being in history mode
	if(this.mode !== HISTORY_MODE) {
		this.toHistoryMode();
		this.editor.setValue(data.str);	
		this.updateInfosUser();
		this.toEditionMode(true);
		this.infosUsersModule.updateRemoteInfosUsers();
	}
};

AceEditorAdapter.prototype.sendUserInfos = function () {
	var doc = this.editor.session.doc;
	var index;
	var aceSelections;
	var i;
	var selections = [];
	var indexStart;
	var indexEnd;

	index = doc.positionToIndex(this.editor.getCursorPosition());
	aceSelections = this.editor.session.getSelection();
	if(aceSelections !== null && aceSelections !== undefined && !aceSelections.isEmpty()) {
		if(!aceSelections.inMultiSelectMode) {
			if(aceSelections.isBackwards()) {
				indexStart = doc.positionToIndex(aceSelections.lead);
				indexEnd = doc.positionToIndex(aceSelections.anchor);
			}
			else {
				indexStart = doc.positionToIndex(aceSelections.anchor);
				indexEnd = doc.positionToIndex(aceSelections.lead);
			}
			selections.push({ start: indexStart, end: indexEnd });
		}
	}
	this.emit('changeCursorAndSelections', { infosUser: { cursorIndex: index, selections: selections } });
};

AceEditorAdapter.prototype.onChangeAdapter = function (e) {
	var data = e.data;
    var i;
    var action;
    var index = this.editor.session.doc.positionToIndex(data.range.start, 0);
    var text = '';

    this.userInfosChanged = true;

    if(data.action === 'insertLines' || data.action === 'removeLines') {
		action = data.action.replace('Lines', 'Text');
		for(i=0; i<data.lines.length; i++) {
			text += data.lines[i] + '\n';
		}
    }
    else {
    	action = data.action;
    	text = data.text; 
    }
    this.emit('localOperation', { operation: { action: action, index: index, text: text }});
    this.infosUsersModule.updateRemoteInfosUsers();
};

AceEditorAdapter.prototype.update = function (data) {
	/**
	 * 	Format attendu de data : 
	 *	data = {
	 *		str: La nouvelle chaîne de caractères qui correspond au modèle
	 * 		//diffCursor: Le nombre de caractères dont le curseur doit se déplacer pour répercuter la modification du modèle
	 *		operations: Tableau contenant l'ensemble des textOperations obtenues à partir de la LogootSOp distante
	 *		diffNbLines: Le nombre de lignes dont la vue doit scroller pour répercuter la modification du modèle
	 * 	}
	 */

	var aceEditorAdapter = this;

	var doc = this.editor.session.doc;
	var i, j;
	var operation;

	this.editor.removeAllListeners('change');

	for(i=0; i<data.operations.length; i++) {
		operation = data.operations[i];
		console.log('text: ', this.editor.getValue());
		console.log('operation: ', operation);
		if(operation.content !== undefined) {
			var position = doc.indexToPosition(operation.offset);
			doc.insert(position, operation.content);
		}
		else {
			var start = doc.indexToPosition(operation.offset);
			var end = doc.indexToPosition(operation.offset + operation.length);
			doc.remove(new Range(start.row, start.column, end.row, end.column));
		}
	}

	// Update the collaborators' infos
	this.infosUsersModule.updateRemoteInfosUsers();

	this.editor.on('change', function (e) {
		if(aceEditorAdapter.disabled === false) { 
			aceEditorAdapter.onChangeAdapter(e);
		}
	});
};

AceEditorAdapter.prototype.clearRemoteIndicators = function () {
	var i;
	if(this.currentMarkers !== null && this.currentMarkers !== length) {
		for(i=0; i<this.currentMarkers.length; i++) {
			this.editor.session.removeMarker(this.currentMarkers[i]);
		}
	}
};

AceEditorAdapter.prototype.addRemoteCursor = function (cursorIndex, cursorHTML) {
	var posCursor = this.editor.session.doc.indexToPosition(cursorIndex);
	var range = new Range(posCursor.row, posCursor.column, posCursor.row, posCursor.column+1);

	this.currentMarkers.push(this.editor.session.addMarker(range, '', function (html, range, left, top, config) {
		var finalCursorHTML = cursorHTML.replace('top:FLAG_TOP', 'top:'+top).replace('left:FLAG_LEFT', 'left:'+left);
		return html.push(finalCursorHTML);
	}, true));
};

AceEditorAdapter.prototype.addRemoteSelection = function (selections, cssClass) {
	var posStart;
	var posEnd;
	var range;
	var i;

	for(i=0; i<selections.length; i++) {
		posStart = this.editor.session.doc.indexToPosition(selections[i].start);
		posEnd = this.editor.session.doc.indexToPosition(selections[i].end);
		range = new Range(posStart.row, posStart.column, posEnd.row, posEnd.column);
		this.currentMarkers.push(this.editor.session.addMarker(range, cssClass, 'line'));
	}
};

AceEditorAdapter.prototype.updateVisibleNames = function () {
	var i;
	var row;
	var column;
	
	var remoteCursors = $('[data-remote-cursor=true]');
	var remoteCursorID;

	for(i=0; i<remoteCursors.length; i++) {
		remoteCursorID = '#' + remoteCursors[i].id;
		row = $(remoteCursorID).attr('data-remote-cursor-row');
		column = $(remoteCursorID).attr('data-remote-cursor-column');

		$(remoteCursorID).find('.name').hide();
		$(remoteCursorID).find('.nubbin').show();

		if(this.mousePos.row == row && this.mousePos.column == column) {
			$(remoteCursorID).find('.name').show();
			$(remoteCursorID).find('.nubbin').hide();	
		}
	}
};

AceEditorAdapter.prototype.toHistoryMode = function () {
	if(this.mode !== HISTORY_MODE) {
		this.previousUndoManager = this.editor.session.getUndoManager();
		this.editor.session.setUndoManager(new UndoManager());
		this.previousLine = parseInt(this.editor.renderer.getScrollTopRow());
		this.editor.removeAllListeners('change');
		this.editor.removeAllListeners('changeSelection');
		this.editor.removeAllListeners('mousemove');
		this.coordinator.removeAllListeners('update');
		this.editor.setReadOnly(true);
		this.emit('readOnlyModeOn');
		this.mode = HISTORY_MODE;
	}
};

AceEditorAdapter.prototype.setText = function (text) {
	this.editor.session.doc.setValue(text);
};

AceEditorAdapter.prototype.toEditionMode = function (flag) {
	var aceEditorAdapter = this;
	var pos;

	if(this.mode !== EDITOR_MODE) {
		this.editor.on('change', function (e) {
			if(aceEditorAdapter.disabled === false) { 
				aceEditorAdapter.onChangeAdapter(e);
			}
		});

		if(this.coordinator !== null && this.coordinator !== undefined) {
			this.coordinator.on('update', function (data) {
				if(aceEditorAdapter.disabled === false) { 
					aceEditorAdapter.update(data);
				}
			});	
		}

		this.editor.on('changeSelection', function (e) {
			if(aceEditorAdapter.disabled === false) { 
				aceEditorAdapter.lastCursorIndex = aceEditorAdapter.editor.session.doc.positionToIndex(aceEditorAdapter.editor.getCursorPosition());
				if(aceEditorAdapter.userInfosUpdateTimeout === null) {
					aceEditorAdapter.userInfosUpdateTimeout = setTimeout(function () {
						aceEditorAdapter.sendUserInfos();
						aceEditorAdapter.userInfosUpdateTimeout = null;
					}, 1000);
				};
				aceEditorAdapter.userInfosChanged = true;
			}
		});

		this.editor.on('mousemove', function (e) {
			if(aceEditorAdapter.disabled === false) { 
				aceEditorAdapter.mousePos = aceEditorAdapter.editor.renderer.screenToTextCoordinates(e.clientX, e.clientY);
				aceEditorAdapter.updateVisibleNames();
			}
		});

		pos = this.editor.session.doc.indexToPosition(this.lastCursorIndex, 0)
		this.editor.navigateTo(pos.row, pos.column);
		this.editor.scrollToRow(this.previousLine);

		this.editor.session.setUndoManager(this.previousUndoManager);
		this.previousUndoManager = null;
		this.editor.setReadOnly(false);
		this.emit('readOnlyModeOff');
		this.mode = EDITOR_MODE;

		this.editor.focus();
	}
};

AceEditorAdapter.prototype.isInHistoryMode = function () {
	return this.mode === HISTORY_MODE;
};

AceEditorAdapter.prototype.isInEditorMode = function () {
	return this.mode === EDITOR_MODE;
};

AceEditorAdapter.prototype.indexToPosition = function (index) {
	return this.editor.session.doc.indexToPosition(index, 0);
};

AceEditorAdapter.prototype.updateInfosUser = function () {
	var doc = this.editor.session.doc;
	var infosUser = this.infosUsersModule.getLocalInfosUser();
	var selection = this.editor.getSelection();
	var posStartSelection;
	var posEndSelection;
	var pos;

	// Update the user's cursor's index and the current text selected
	pos = doc.indexToPosition(infosUser.cursorIndex, 0);
	this.editor.navigateTo(pos.row, pos.column);

	selection.ranges = [];
	selection.rangeCount = 0;
	for(i=0; i<infosUser.selections.length; i++) {
		posStartSelection = doc.indexToPosition(infosUser.selections[i].start);
		posEndSelection = doc.indexToPosition(infosUser.selections[i].end);

		selection.setSelectionRange(new Range(posStartSelection.row, posStartSelection.column, posEndSelection.row, posEndSelection.column));
	}
};

AceEditorAdapter.prototype.onCoordinatorDisposedHandler = function (data) {
	var key;

	this.emit('textEditorAdapterDisposed');
	this.editor.setReadOnly(true);

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disabled') {
            	this.disabled = true;
            }
            else if(key !== 'editor') {
                this[key] = null;
            }
        }
    }

    this.setText(data.str);
    this.clearRemoteIndicators();
};

module.exports = AceEditorAdapter;
},{"events":7}],3:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-client.
 *
 *  Mute-client is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-client is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-client.  If not, see <http://www.gnu.org/licenses/>.
 */

var ONLINE_MODE = 0;
var OFFLINE_MODE = 1;

var Utils = _dereq_('mute-utils');
var events = _dereq_('events');

var LogootSRopes = _dereq_('mute-structs').LogootSRopes;
var TextInsert = _dereq_('mute-structs').TextInsert;
var TextDelete = _dereq_('mute-structs').TextDelete;
var LogootSAdd = _dereq_('mute-structs').LogootSAdd;
var LogootSDel = _dereq_('mute-structs').LogootSDel;

var Coordinator = function (docID, serverDB) {
    var coordinator = this;

    // Attributes stored into the DB
    this.docID = docID;
    this.creationDate = new Date();
    this.history = [];
    this.lastModificationDate = new Date();
    this.replicaNumber = -1;
    this.clock = 0;
    this.ropes = null;
    this.bufferLocalLogootSOp = []; // Buffer contenant les LogootSOperations locales actuellement non ack
    this.mode = ONLINE_MODE;
    // --------------------------------

    this.disposed = false;

    this.changed = false;
    this.flagDB = false;
    this.readOnlyMode = false;


    this.bufferLogootSOp = [];      // Buffer contenant les LogootSOperations distantes actuellement non traitées
    this.bufferTextOp = [];         // Buffer contenant les TextOperations locales actuellement non converties en LogootSOperations
    
    this.prevOp = false;    // Type de la dernière opération
    this.prevOpPos = -1;    // Position de la dernière opération
    this.posCursor = 0;     // Position 'actuelle' du curseur
    this.viewTopRow = 0;    // Numéro de la ligne actuellement au sommet de la vue
    this.busy = false;      // Flag indiquant si l'utilisateur a saisi qqch depuis 1 sec
    this.flag = false;      // Flag évitant d'appeler simultanément plusieurs fois la même fonction
    
    this.network = null;
    this.editor = null;
    this.timerTextOp = null;
    this.serverDB = serverDB;

    this.intervalCleanBufferTextOp = null;
    this.intervalCleanBufferLogootSOp = null;

    this.updateLastModificationDateTimeout = null;

    this.localOperationHandler = function (data) {
        if(coordinator.disposed === false) {
            var action = data.operation.action;
            var index = data.operation.index;
            var text = data.operation.text;
            
            coordinator.addBufferTextOp({ action: action, index: index, text: text });
            coordinator.updateLastModificationDate(new Date().valueOf());
        }
    };

};

Coordinator.prototype.__proto__ = events.EventEmitter.prototype;

Coordinator.prototype.init = function () {
    var coordinator = this;
    var callback = function () {
        if(coordinator.mode === ONLINE_MODE && coordinator.network !== null && coordinator.network !== undefined) {
            // Wait for the server's current version
            coordinator.emit('initNetwork');
        }
        else {
            // Allow the user to edit the document offline
            coordinator.join(coordinator);
        }
    };

    this.serverDB.models.query()
    .filter('docID', this.docID)
    .execute()
    .done(function (results) {
        var doc;
        if(results.length === 0) {
            // New doc, add it to the DB
            doc = {
                docID: coordinator.docID,
                creationDate: coordinator.creationDate,
                history: coordinator.history,
                lastModificationDate: coordinator.lastModificationDate,
                replicaNumber: coordinator.replicaNumber,
                clock: coordinator.clock,
                ropes: coordinator.ropes,
                bufferLocalLogootSOp: coordinator.bufferLocalLogootSOp,
                mode: ONLINE_MODE,
            };
            coordinator.serverDB.models.add(doc)
            .done(function (item) {
                callback();
            });
        }
        else {
            // Retrieve the data stored
            doc = results[0];
            coordinator.creationDate = doc.creationDate;
            coordinator.history = doc.history;
            coordinator.lastModificationDate = doc.lastModificationDate;
            coordinator.replicaNumber = doc.replicaNumber;
            coordinator.clock = doc.clock;
            coordinator.ropes = doc.ropes;
            coordinator.bufferLocalLogootSOp = doc.bufferLocalLogootSOp;
            coordinator.mode = doc.mode;
            callback();
        }
    });

    this.intervalChanged = setInterval(function () {
        if(coordinator.changed === true) {
            coordinator.updateDoc();
        }
    }, 1000);
};

Coordinator.prototype.setEditor = function (editor) {
    var coordinator = this;

    this.editor = editor;

    this.editor.on('cursor', function (posCursor) {
        if(coordinator.disposed === false) {
            coordinator.posCursor = posCursor;
        }
    });
    this.editor.on('scroll', function (viewTopRow) {
        if(coordinator.disposed === false) { 
            coordinator.viewTopRow = viewTopRow; 
        }
    });

    this.editor.on('readOnlyModeOn', function () {
        if(coordinator.disposed === false) {
            coordinator.readOnlyMode = true;
        }
    });

    this.editor.on('readOnlyModeOff', function () {
        if(coordinator.disposed === false) {
            coordinator.readOnlyMode = false;
            coordinator.emit('initEditor', { str: coordinator.ropes.str });
        }
    });
};

Coordinator.prototype.setNetwork = function (network) {
    var coordinator = this;
    var content;
    var replicaNumber;

    this.network = network;

    this.network.on('receiveDoc', function (args) {
        if(coordinator.disposed === false) { 
            coordinator.join(args);
        }
    });
    this.network.on('receiveOps', function (data) {
        if(coordinator.disposed === false) {
            Utils.pushAll(coordinator.bufferLogootSOp, data.logootSOperations);
        }
    });
    this.network.on('ack', function (data) {
        if(coordinator.disposed === false) {
            if(data.length > 0) {
                coordinator.bufferLocalLogootSOp = coordinator.bufferLocalLogootSOp.splice(data.length);
                coordinator.changed = true;
            }
        }
    });
    this.network.on('connect', function () {
        if(coordinator.disposed === false) {
            coordinator.emit('queryDoc', { docID: coordinator.docID, replicaNumber: coordinator.replicaNumber, bufferLocalLogootSOp: coordinator.bufferLocalLogootSOp });
        }
    });
};

Coordinator.prototype.addBufferTextOp = function (data) {
    /**
     *  Format attendu de data : 
     *  data = {
     *      action: Le type d'action réalisée (insertText, removeText, insertLines, removeLines)
     *      index: La position à laquelle l'action a été réalisée dans le texte
     *      text: Le texte inséré ou supprimé, dans le cas d'un insertText ou removeText
     *  }
     */
    var coordinator = this;

    this.busy = true;
    var newOperation = false;

    //Si on vient de changer d'action
    if(this.prevOp !== data.action) {
        //On va donc créer une nouvelle opération
        newOperation = true;
    }

    if(data.action === 'insertText')
    {
        if(this.prevOpPos !== data.index) {
            newOperation = true;
        }
        if(newOperation) {
            this.bufferTextOp.push(new TextInsert(data.index, data.text));
        }
        else {
            //Sinon, on concatène la nouvelle chaîne à l'opération existante
            Utils.getLast(this.bufferTextOp).content += data.text;
        }
        this.prevOpPos = data.index + data.text.length;
        this.prevOp = 'insertText';
    }
    else if(data.action === 'removeText')
    {
        //Si on a pas déjà déterminé qu'il s'agit d'une nouvelle opération
        if(!newOperation) {
            //On vérifie si on peut fusionner cette opération avec la dernière opération
            newOperation = true;
            var last = Utils.getLast(this.bufferTextOp);
            if(this.prevOp === 'removeText'
                && data.index + data.text.length >= last.offset
                && data.index <= last.offset) {
                newOperation = false;
            }
        }
        if(newOperation) {
            this.bufferTextOp.push(new TextDelete(data.index, data.text.length));
        }
        else {
            last.length += data.text.length;
            last.offset = data.index;
        }
        this.prevOpPos -= data.text.length;
        this.prevOp = 'removeText';
    }
    else {
        console.error('-- Impossible de convertir les modifications en TextOperations --');
        console.error(data);
    }

    if(newOperation === true) {
        clearTimeout(this.timerTextOp);
        this.timerTextOp = setTimeout(function() {
            console.log('Fin des 1s de buffer, on envoie.');
            coordinator.busy = false;
            coordinator.cleanBufferTextOp();
            coordinator.timerTextOp = null;
        }, 1000);
    }
};

Coordinator.prototype.cleanBufferTextOp = function () {
    var logootSOperations;
    var taille;
    var i;
    var to;
    var content;

    //On positionne un flag à true pour être sur de pas faire appel plusieurs fois à la même méthode simultanément
    if(this.bufferTextOp.length > 0 && this.flag !== true) {
        this.flag = true;

        logootSOperations = [];
        taille = this.bufferTextOp.length;

        i = 1;
        if(this.busy === false) {
            //Si l'utilisateur n'est pas en train de travailler
            //On consomme le buffer entièrement (une seule opération en théorie)
            i = 0;
            //Et on remet à 0 les paramètres de bufferisation
            this.prevOpPos = -1;
            this.prevOp = false;
        }
        for(i; i<taille; i++) {
            to = this.bufferTextOp.shift();
            // Add the text operation to the history
            if(to.length != null && (to.offset != null || to.offset == 0)) {
                // Deletion
                to.deletion = this.ropes.str.substr(to.offset, to.length);
            }
            this.history.push(to);
            logootSOperations.push(to.applyTo(this.ropes));
        }
        //Il faut maintenant envoyer les logootSOperations générées au serveur et aux autres peers
        if(logootSOperations.length !== 0) {
            //On stocke en local au cas où il y a une déconnexion
            this.changed = true;
            Utils.pushAll(this.bufferLocalLogootSOp, logootSOperations);
            this.emit('operations', logootSOperations);
        }

        this.clock = this.ropes.clock;
        this.flag = false;
    }
};

Coordinator.prototype.cleanBufferLogootSOp = function () {
    var coordinator = this;
    var i;
    var temp;
    var lo;
    var tos;
    var to;
    var operations = [];
    var res;
    var diffCursor = 0;
    var diffNbLines = 0;
    var owner = 0;

    while(!this.busy && this.flag !== true
        && this.bufferTextOp.length === 0 && this.bufferLogootSOp.length > 0 ) {
        this.flag = true;
        diffNbLines = Utils.occurrences(this.ropes.str, '\n');
        if(this.editor !== null) {
            this.editor.removeAllListeners('change');
        }
        temp = this.bufferLogootSOp.shift();
        owner = temp.owner;
        lo = this.generateLogootSOp(temp);
        // Each LogootSOperation generates a TextOperations array when applied
        tos = lo.execute(this.ropes);
        for(i=0; i<tos.length; i++)
        {
            to = tos[i];
            to.owner = owner;
            if(to.length != null && (to.offset != null || to.offset == 0)) {
                // Keep the deleted text for the history
                to.deletion = this.ropes.str.substr(to.offset, to.length);
            }
            this.history.push(to);
            operations.push(to);

            temp = this.applyTextOperation(this.ropes.str, to);
            this.ropes.str = temp;
        }
        diffNbLines = Utils.occurrences(this.ropes.str, '\n') - diffNbLines;

        this.prevOpPos = -1;
        this.prevOp = false;
        this.flag = false;

        this.emit('remoteOperations', { operations: operations });
        this.emit('update', { str: this.ropes.str, diffNbLines: diffNbLines, operations: tos });
        
        //this.emit('awareness', { nbLogootSOp: this.bufferLogootSOp.length });
        if(this.editor !== null) {
            this.editor.on('change', function (data) {
                if(coordinator.disposed === false) {
                    coordinator.addBufferTextOp(data);
                    coordinator.updateLastModificationDate(new Date().valueOf());
                }
            });
        }
        coordinator.updateLastModificationDate(new Date().valueOf());
        this.changed = true;
    }
};

Coordinator.prototype.generateLogootSOp = function (temp) {
    // Must identify which type of logootSOperation it is
    if(temp.id !== undefined && temp.l !== undefined && temp.id !== null && temp.l !== null) {
            // Insertion
            var id = new Identifier(temp.id.base, temp.id.last);
            return new LogootSAdd(id, temp.l);
    }
    else if(temp.lid !== undefined && temp.lid !== null) {
        // Deletion
        var lid = [];
        for(i=0; i<temp.lid.length; i++) {
            lid.push(new IdentifierInterval(temp.lid[i].base, temp.lid[i].begin, temp.lid[i].end));
        }
        return new LogootSDel(lid);
    }
};

Coordinator.prototype.applyTextOperation = function (str, to) {
    // Must identify which type of text operation it is
    if(to.content !== undefined && to.offset !== undefined && to.content !== null && to.offset !== null) {
        // Insertion
        str = Utils.insert(str, to.offset, to.content);
    }
    else if(to.length !== undefined && to.length !== null && to.offset !== undefined && to.offset !== null) {
        // Deletion
        str = Utils.del(str, to.offset, to.offset + to.length - 1);
    }
    return str;
};

Coordinator.prototype.applyReverseTextOperation = function (str, to) {
    if(to.content !== undefined && to.offset !== undefined && to.content !== null && to.offset !== null) {
        // Insertion so have to delete
        str = Utils.del(str, to.offset, to.offset + to.content.length - 1);
    }
    else if(to.length !== undefined && to.length !== null && to.offset !== undefined && to.offset !== null) {
        // Deletion so have to insert
        str = Utils.insert(str, to.offset, to.deletion);
    }
    return str;
};
Coordinator.prototype.giveCopy = function() {
    var args;
    args.bufferLogootSOp = this.bufferLogootSOp;
    args.bufferLocalLogootSOp = this.bufferLocalLogootSOp;
    //TODO
};
Coordinator.prototype.join = function (json) {
    var coordinator = this;

    var temp;
    var content;

    json.docID = this.docID;    

    this.replicaNumber = json.replicaNumber;
    coordinator.updateLastModificationDate(new Date(json.lastModificationDate).valueOf());
    this.creationDate = json.creationDate;

    if(this.editor !== null) {
        this.editor.removeListener('localOperation', this.localOperationHandler);
    }

    if(json.ropes !== null && json.ropes !== undefined) {
        // Have to use a var temp in case of replicating the coordinator's ropes (offline-mode)
        temp = new LogootSRopes(this.replicaNumber);
        temp.copyFromJSON(json.ropes);
        temp.clock = this.clock;
        this.ropes = temp;
    }

    this.history = json.history;

    Utils.pushAll(this.bufferLogootSOp, json.bufferLogootSOp);

    if(this.readOnlyMode === false) {
        this.emit('initEditor', { str: this.ropes.str });
    }
    
    this.emit('updateHistoryScrollerValue', { length: this.history.length });

    /**
     * Ajout de la fonction générant des TextOperations à partir des saisies de l'utilisateur
     */
    if(this.editor !== null) {
        this.editor.on('localOperation', this.localOperationHandler);
    }
    
    if(this.intervalCleanBufferTextOp === null && this.intervalCleanBufferLogootSOp === null) {
        this.intervalCleanBufferTextOp = setInterval(function () {
            coordinator.cleanBufferTextOp();
        }, 250);

        this.intervalCleanBufferLogootSOp = setInterval(function () {
            coordinator.cleanBufferLogootSOp();
        }, 250);
    }

    this.changed = true;
};

Coordinator.prototype.getHistoryLength = function () {
    return this.history.length;
};

Coordinator.prototype.receive = function (logootSOperations) {
    Utils.pushAll(this.bufferLogootSOp, logootSOperations);
    this.emit('awareness', { nbLogootSOp: this.bufferLogootSOp.length });
};

Coordinator.prototype.updateState = function (str, currentState, newState) {
    var i;
    if(newState === 0) {
        return '';
    }
    if(newState > currentState) {
        if(newState <= this.history.length) {
            for(i=currentState; i<newState; i++) {
                str = this.applyTextOperation(str, this.history[i], false);
            }   
        }
    }
    else if(newState < currentState) {
        if(newState > 0) {
            for(i=currentState-1; i>newState-1; i--) {
                str = this.applyReverseTextOperation(str, this.history[i], false);
            }
        }
    }
    return str;
};

Coordinator.prototype.updateDoc = function () {
    var coordinator = this;
    var temp;

    if(this.flagDB === false) {
        this.flagDB = true;
        this.changed = false;
        temp = {
            docID: this.docID,
            creationDate: this.creationDate,
            history: this.history,
            lastModificationDate: this.lastModificationDate,
            replicaNumber: this.replicaNumber,
            clock: this.clock,
            ropes: this.ropes,
            bufferLocalLogootSOp: this.bufferLocalLogootSOp,
        };

        this.serverDB.models.query()
        .filter('docID', temp.docID)
        .modify({ replicaNumber: temp.replicaNumber, ropes: temp.ropes, history: temp.history, lastModificationDate: temp.lastModificationDate, clock: temp.clock, bufferLocalLogootSOp: temp.bufferLocalLogootSOp })
        .execute()
        .done(function (results) {
            console.log('MàJé :p');
            coordinator.flagDB = false;
        });
    }
};

Coordinator.prototype.toOnlineMode = function () {
    var coordinator = this;
    this.mode = ONLINE_MODE;

    this.serverDB.models.query()
    .filter('docID', this.docID)
    .modify({ mode: ONLINE_MODE })
    .execute()
    .done(function (results) {
        coordinator.emit('initNetwork');
    });
};

Coordinator.prototype.toOfflineMode = function () {
    this.mode = OFFLINE_MODE;
    this.serverDB.models.query()
    .filter('docID', this.docID)
    .modify({ mode: OFFLINE_MODE })
    .execute()
    .done(function (results) {
        coordinator.emit('disconnect');
    });
};

Coordinator.prototype.updateLastModificationDate = function (dateValue) {
    var coordinator = this;
    this.lastModificationDate = dateValue;
    if(this.updateLastModificationDateTimeout === null) {
        coordinator.updateLastModificationDateTimeout = setTimeout(function () {
            coordinator.emit('updateLastModificationDate', { lastModificationDate: coordinator.lastModificationDate });
            coordinator.updateLastModificationDateTimeout = null;
        }, 1000);
    };
};

Coordinator.prototype.dispose = function () {
    var key;

    this.emit('coordinatorDisposed', { str: this.ropes.str });

    clearInterval(this.intervalCleanBufferTextOp);
    clearInterval(this.intervalCleanBufferLogootSOp);
    clearInterval(this.intervalChanged);

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disposed') {
                this.disposed = true;
            }
            else {
                this[key] = null;
            }
        }
    }
};

module.exports = Coordinator;
},{"events":7,"mute-structs":8,"mute-utils":24}],4:[function(_dereq_,module,exports){
var events = _dereq_('events');

var InfosUsersModule = function (docID, coordinator, editor, network, usernameManager, serverDB) {
    var infosUsersModule = this;

    this.docID = docID;
    this.infosUsers = {
        '-1': {
            cursorIndex: 0,
            selections: [],
            username: 'Unknown user'
        }
    };
    this.replicaNumber = -1;
    this.updateTimeout = null;
    this.readOnlyMode = false;
    this.offlineMode = true;
    this.disposed = false;

    this.coordinator = coordinator;

    // Coordinator signals the remote operations applied to the model
    coordinator.on('remoteOperations', function (data) {
        var operations;
        if(infosUsersModule.disposed === false) {
            operations = data.operations;
            infosUsersModule.applyRemoteOperations(operations);
        }
    });

    coordinator.on('coordinatorDisposed', function () {
        //infosUsersModule.coordinator = null;
        if(infosUsersModule.disposed === false) {
            infosUsersModule.onCoordinatorDisposedHandler();
        }
    });

    this.editor = editor;

    editor.on('changeCursorAndSelections', function (data) {
        if(infosUsersModule.disposed === false) {
            var cursorIndex = data.infosUser.cursorIndex;
            var selections = data.infosUser.selections;

            data.replicaNumber = infosUsersModule.replicaNumber;
            if(infosUsersModule.offlineMode === false) {
                infosUsersModule.emit('changeLocalCursorAndSelections', data);
            }
            infosUsersModule.updateCursorAndSelections(infosUsersModule.replicaNumber, cursorIndex, selections);
        }
    });

    // Editor signals the changes made by the user to the document
    editor.on('localOperation', function (data) {
        var action;
        var index;
        var text;
        if(infosUsersModule.disposed === false) {
            action = data.operation.action;
            index = data.operation.index;
            text = data.operation.text;
            infosUsersModule.applyLocalOperation(action, index, text);
        }
    });

    editor.on('readOnlyModeOn', function () {
        if(infosUsersModule.disposed === false) {
            infosUsersModule.readOnlyMode = true;
            infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
        }
    });

    editor.on('readOnlyModeOff', function () {
        if(infosUsersModule.disposed === false) {
            infosUsersModule.readOnlyMode = false;
            infosUsersModule.updateRemoteInfosUsers();
        }
    });

    if(network !== null && network !== undefined) {
        this.network = network;

        var joinDoc = function (data) {
            var replicaNumber;
            var infosUser;

            infosUsersModule.replicaNumber = data.replicaNumber;
            delete infosUsersModule.infosUsers['-1'];

            for(replicaNumber in data.infosUsers) {
                infosUser = data.infosUsers[replicaNumber];
                infosUsersModule.infosUsers[replicaNumber] = {
                    cursorIndex: infosUser.cursorIndex,
                    selections: infosUser.selections,
                    username: infosUser.username
                };
            }

            infosUsersModule.updateLocalUsername(infosUsersModule.infosUsers[infosUsersModule.replicaNumber].username);

            infosUsersModule.network.removeListener('receiveDoc', joinDoc);
            infosUsersModule.network.on('receiveDoc', reconnectToDoc);
        };

        var reconnectToDoc = function (data) {
            var replicaNumber;
            var infosUser = infosUsersModule.getLocalInfosUser();
            var temp = {};

            temp[infosUsersModule.replicaNumber] = {
                cursorIndex: infosUser.cursorIndex,
                selections: infosUser.selections,
                username: infosUser.username
            };

            for(replicaNumber in data.infosUsers) {
                if(parseInt(replicaNumber) !== parseInt(infosUsersModule.replicaNumber)) {
                    infosUser = data.infosUsers[replicaNumber];
                    temp[replicaNumber] = {
                        cursorIndex: infosUser.cursorIndex,
                        selections: infosUser.selections,
                        username: infosUser.username
                    };
                }
            }

            infosUsersModule.infosUsers = temp;
        };

        network.on('receiveDoc', joinDoc);

        network.on('receiveUserJoin', function (data) {
            if(infosUsersModule.disposed === false) {
                var replicaNumber = data.replicaNumber;
                var username = data.username;

                infosUsersModule.emit('addCollaborator', data);
                infosUsersModule.addUser(replicaNumber, username);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('receiveUserLeft', function (data) {
            var replicaNumber = data.replicaNumber;
            if(infosUsersModule.disposed === false) {
                infosUsersModule.emit('removeCollaborator', data);
                infosUsersModule.removeUser(replicaNumber);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('changeCollaboratorCursorAndSelections', function (data) {
            var replicaNumber = data.replicaNumber;
            var cursorIndex = data.infosUser.cursorIndex;
            var selections = data.infosUser.selections;

            if(infosUsersModule.disposed === false) {
                infosUsersModule.updateCursorAndSelections(replicaNumber, cursorIndex, selections);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });
        
        network.on('changeCollaboratorUsername', function (data) {
            var replicaNumber = data.replicaNumber;
            var username = data.username;

            if(infosUsersModule.disposed === false) {
                infosUsersModule.updateUsername(replicaNumber, username);
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('connect', function () {
            if(infosUsersModule.disposed === false) {
                infosUsersModule.offlineMode = false;
                infosUsersModule.updateRemoteInfosUsers();
            }
        });

        network.on('disconnect', function () {
            if(infosUsersModule.disposed === false) {
                infosUsersModule.offlineMode = true;
                infosUsersModule.emit('updateRemoteIndicators', { infosUsers: {} });
                infosUsersModule.emit('updateCollaboratorsList', { infosUsers: {} });
            }
        });

        network.on('networkDisposed', function () {
            if(infosUsersModule.disposed === false) { 
                infosUsersModule.network = null;
            }
        });
    }

    this.serverDB = serverDB;

    this.initUsername();
};

InfosUsersModule.prototype.__proto__ = events.EventEmitter.prototype;

InfosUsersModule.prototype.initUsername = function () {
    var infosUsersModule = this;
    var username = null;

    this.serverDB.models.query()
    .filter('docID', this.docID)
    .execute()
    .done(function (results) {
        if(results.length > 0) {
            username = results[0].username;
        }
        infosUsersModule.updateLocalUsername(username);
    });
};

InfosUsersModule.prototype.getLocalInfosUser = function () {
    return this.infosUsers[this.replicaNumber];
};

InfosUsersModule.prototype.getUsername = function () {
    return this.infosUsers[this.replicaNumber].username;
};

InfosUsersModule.prototype.updateCursorAndSelections = function (replicaNumber, cursorIndex, selections) {
    if(this.infosUsers[replicaNumber] !== null
        && this.infosUsers[replicaNumber] !== undefined) {
        this.infosUsers[replicaNumber].cursorIndex = cursorIndex;
        this.infosUsers[replicaNumber].selections = selections;
    }
};

InfosUsersModule.prototype.applyLocalOperation = function (action, index, text) {
    var replicaNumber;
    var infosUser;

    for(replicaNumber in this.infosUsers) {
        infosUser = this.infosUsers[replicaNumber];
        // Since the 'changeCursorAndSelections' event will be triggered to update the user's infos
        // We just have to update the collaborators' ones
        if(parseInt(this.replicaNumber) !== parseInt(replicaNumber)) {
            if(index < infosUser.cursorIndex) {
                if(action === 'insertText') {
                    infosUser.cursorIndex += text.length;
                }
                else if(action === 'removeText') {
                    infosUser.cursorIndex -= text.length;
                }
            }

            for(i=0; i<infosUser.selections.length; i++) {
                selection = infosUser.selections[i];
                if(index < selection.start) {
                    if(action === 'insertText') {
                        selection.start += text.length;
                    }
                    else if(action === 'removeText') {
                        selection.start -= text.length;
                    }
                }

                if(index < selection.end) {
                    if(action === 'insertText') {
                        selection.end += text.length;
                    }
                    else if(action === 'removeText') {
                        selection.end -= text.length;
                    }
                }
            }
        }
    }
};

InfosUsersModule.prototype.applyRemoteOperations = function (operations) {
    var i, j;
    var operation;
    var replicaNumber;
    var diffCursor = 0;

    for(i=0; i<operations.length; i++) {
        operation = operations[i];
        
        if(operation.content !== undefined && operation.offset !== undefined && operation.content !== null && operation.offset !== null) {
            // Insertion
            diffCursor = operation.content.length;
        }
        else if(operation.length !== undefined && operation.length !== null && operation.offset !== undefined && operation.offset !== null) {
            // Deletion
            diffCursor = - operation.length;
        }

        for(replicaNumber in this.infosUsers) {
            if(parseInt(replicaNumber) !== parseInt(operation.owner)) {
                infosUser = this.infosUsers[replicaNumber];
                if(operation.offset < infosUser.cursorIndex) {
                    infosUser.cursorIndex += diffCursor;
                }
                for(j=0; j<infosUser.selections.length; j++) {
                    selection = infosUser.selections[j];
                    if(operation.offset < selection.start) {
                        selection.start += diffCursor;
                    }
                    if(operation.offset < selection.end) {
                        selection.end += diffCursor;
                    }
                }
            }
        }
    }
};

InfosUsersModule.prototype.updateRemoteInfosUsers = function () {
    var infosUsersModule = this;
    var replicaNumber;
    var infosUser;
    var temp = {};

    if(this.updateTimeout === null) {
        this.updateTimeout = setTimeout(function () {
            for(replicaNumber in infosUsersModule.infosUsers) {
                if(parseInt(replicaNumber) !== parseInt(infosUsersModule.replicaNumber) && parseInt(infosUsersModule.replicaNumber)>0) {
                    infosUser = infosUsersModule.infosUsers[replicaNumber];
                    temp[replicaNumber] = infosUser;
                }
            }
            if(infosUsersModule.readOnlyMode === false && infosUsersModule.offlineMode === false) {
                infosUsersModule.emit('updateRemoteIndicators', { infosUsers: temp });
            }
            if(infosUsersModule.offlineMode === false) {
                infosUsersModule.emit('updateCollaboratorsList', { infosUsers: temp });
            }
            infosUsersModule.updateTimeout = null;
        }, 100);
    };


};

InfosUsersModule.prototype.addUser = function (replicaNumber, username) {
    this.infosUsers[replicaNumber] = {
        username: username,
        cursorIndex: 0,
        selections: []
    };
};

InfosUsersModule.prototype.removeUser = function (replicaNumber) {
    if(parseInt(this.replicaNumber) !== parseInt(replicaNumber)) {
        delete this.infosUsers[replicaNumber];
    }   
};

InfosUsersModule.prototype.updateLocalUsername = function (username) {
    var infosUsersModule = this;
    this.serverDB.models.query()
    .filter('docID', this.docID)
    .modify({ username: username })
    .execute()
    .done(function (results) {
        infosUsersModule.infosUsers[infosUsersModule.replicaNumber].username = username;
        infosUsersModule.emit('changeLocalUsername', { replicaNumber: infosUsersModule.replicaNumber, username: username });
    });
};

InfosUsersModule.prototype.updateUsername = function (replicaNumber, username) {
    if(this.infosUsers[replicaNumber] !== null
        && this.infosUsers[replicaNumber] !== undefined) {
        this.infosUsers[replicaNumber].username = username;
    }
};

InfosUsersModule.prototype.onCoordinatorDisposedHandler = function () {
    var key;

    this.emit('infosUsersModuleDisposed');

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disposed') {
                this.disposed = true;
            }
            else {
                this[key] = null;
            }
        }
    }
};

module.exports = InfosUsersModule;
},{"events":7}],5:[function(_dereq_,module,exports){
var events = _dereq_('events');

var Data = function(event, data){
    this.event = event;
    this.data = data;
};

var PeerIOAdapter = function(coordinator){
    var peerIOAdapter = this;

    this.coordinator = coordinator;
    this.peer = null;
    this.peers = [];
    this.peerId = null;
    this.socketServer = null;
    this.connectionCreated = false;
    this.infosUsersModule = null;
    this.disposed = false;
    this.joinDoc = false;

    this.coordinator.on('initNetwork', function (data) {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.toOnlineMode();
        }
    });

    this.coordinator.on('queryDoc', function (data) {
        if(peerIOAdapter.disposed === false) {
            data.username = peerIOAdapter.infosUsersModule.getUsername();
            // peerIOAdapter.socketServer.emit('joinDoc', data, function (result) {
            //     if(result.error === false) {
            //         peerIOAdapter.emit('ack', { length: result.length });
            //     }
            // });
        }
    });

    this.coordinator.on('coordinatorDisposed', function (data) {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.onCoordinatorDisposedHandler(data);
        }
    });
};

PeerIOAdapter.prototype.__proto__ = events.EventEmitter.prototype;


PeerIOAdapter.prototype.setInfosUsersModule = function(infosUsers){
    var peerIOAdapter = this;
    this.infosUsersModule = infosUsersModule;

    infosUsersModule.on('changeLocalCursorAndSelections', function (data) {
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                newData = new Data('broadcastCollaboratorCursorAndSelections', data);
                peerIOAdapter.peers[i].send(newData);
            }
        }
    });

    infosUsersModule.on('changeLocalUsername', function (data) {
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                newData = new Data('broadcastCollaboratorUsername', data);
                peerIOAdapter.peers[i].send(newData);
            }
        }
    });

};

PeerIOAdapter.prototype.createSocket = function () {
    var peerIOAdapter = this;
    this.peer = [];
    var connOptions = {
        'sync disconnect on unload': true
    };

    this.socketServer = io.connect(location.origin, connOptions);

    this.peer = new Peer({key: 'lwjd5qra8257b9', debug : true});

    this.peer.on('open', function(id){
        peerIOAdapter.peerId = id;
        var infoPeer = {
            docID : peerIOAdapter.coordinator.docID,
            peerID : id
        };
        console.log("ezjfozpif");
        console.log(infoPeer);
        peerIOAdapter.socketServer.emit('newPeer', infoPeer);
    });

    function connect (connection){
        console.log("connection");
        if(!peerIOAdapter.peerAlreadyExists(connection)){
            console.log("ok");
            console.log(connection);
            peerIOAdapter.peers.push(connection);
            if(!peerIOAdapter.joinDoc){
                console.log("joinDoc");
                peerIOAdapter.joinDoc = true;
                var msg = {
                    event : 'joinDoc',
                    data : null
                };
                connection.send(msg);
            }
            connection.on('data', handleEvent);
            connection.on('close', function(){
                this.close();
                var index = peerIOAdapter.peers.indexOf(this);
                peerIOAdapter.peers.splice(index, 1);
            });
        }
    }

    function handleEvent(data){
        if(data.event !== null && data.event !== undefined){
            switch(data.event){
                case 'sendDoc':
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('receiveOps', data);
                    }
                    break;
                case 'broadcastCollaboratorCursorAndSelections':
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('changeCollaboratorCursorAndSelections', data.data);
                    }
                    break;
                case 'broadcastCollaboratorUsername' :
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('changeCollaboratorUsername', data.data);
                    }
                    break;
                case 'broadcastParole' :
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('receiveParole', data.data);
                    }
                    break;
                case 'connect' :
                    //TODO 
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('connect');
                    }
                    break;
                case 'disconnect' :
                    //TODO
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('connect');
                    }
                    break;
                case 'userJoin' :
                    //Demander une copie propre du document ??? 
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('receiveUserJoin', data.data);
                    }
                    break;
                case 'userLeft' :
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('receiveUserLeft', data.data);
                    }
                    break;
                case 'joinDoc' :
                    console.log("YOLLOOOOLLOLOLOLOLOLO");
                    break;
                default :
                    console.log("handleEvent : ERROR !");
                    break;
            }
        }
    }

    function addCollaborator(remoteId){
        console.log("Add collaborator");
        console.log(remoteId);
        var connection = peerIOAdapter.peer.connect(remoteId);
        connection.on('open', function() {
            connect(connection);
        });
    }

    this.socketServer.on('infoPeerIDs', function(inforPeerIds){
        console.log(inforPeerIds);
        var peerIds = inforPeerIds.peers;
        peerIOAdapter.replicaNumber = inforPeerIds.replicaNumber;
        for(var i = 0; i < peerIds.length; i++){
            console.log("Add Peer : " + peerIds[i]);
            var remoteId = peerIds[i];
            addCollaborator(remoteId);
        }
    });

    this.peer.on('connection', connect);

    this.coordinator.on('operations', function (logootSOperations) {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.send(logootSOperations);
        }
    });

    this.coordinator.on('disconnect', function () {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.toOfflineMode();
        }
    });

    this.connectionCreated = true;
    this.emit('connect');

};


PeerIOAdapter.prototype.peerAlreadyExists = function(connection){
    for(var i = 0; i < this.peers.length; i++){
        if(this.peers[i].peer === connection.peer){
            return true;
        }
    }
    return false;
};

PeerIOAdapter.prototype.toOnlineMode = function () {
    this.createSocket();
};

PeerIOAdapter.prototype.toOfflineMode = function () {
    if(this.socketServer !== null && this.socketServer !== undefined) {
        this.socketServer.disconnect();
        this.emptyPeers();
    }
    
};

PeerIOAdapter.prototype.emptyPeers = function() {
    for(var i = 0; i < this.peers.length; i ++){
        this.peers[i].close();
    }
    this.peers = [];
};

PeerIOAdapter.prototype.send = function (logootSOperations) {
    var socketIOAdapter = this;
    var obj = {
        'logootSOperations': logootSOperations,
        'lastModificationDate': new Date()
    };
    var newData = new Data('sendOps', obj);
    for(var i = 0; i < peers.length; i++){
        this.peers[i].send(newData);
    }
};

PeerIOAdapter.prototype.onCoordinatorDisposedHandler = function () {
    var key;

    this.emit('networkDisposed');

    if(this.socket !== null && this.socket !== undefined) {
        this.socket.disconnect();
        this.emptyPeers();
    }

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disposed') {
                this.disposed = true;
            }
            else {
                this[key] = null;
            }
        }
    }
};

PeerIOAdapter.prototype.join = function () {

};
module.exports = PeerIOAdapter;
},{"events":7}],6:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-client.
 *
 *  Mute-client is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-client is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-client.  If not, see <http://www.gnu.org/licenses/>.
 */

var events = _dereq_('events');

var SocketIOAdapter = function (coordinator) {
    var socketIOAdapter = this;

    this.coordinator = coordinator;
    this.socket = null;
    this.connectionCreated = false;
    this.infosUsersModule = null;
    this.disposed = false;

    this.coordinator.on('initNetwork', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.toOnlineMode();
        }
    });

    this.coordinator.on('queryDoc', function (data) {
        if(socketIOAdapter.disposed === false) {
            data.username = socketIOAdapter.infosUsersModule.getUsername();
            socketIOAdapter.socket.emit('joinDoc', data, function (result) {
                if(result.error === false) {
                    socketIOAdapter.emit('ack', { length: result.length });
                }
            });
        }
    });

    this.coordinator.on('coordinatorDisposed', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.onCoordinatorDisposedHandler(data);
        }
    });
};

SocketIOAdapter.prototype.__proto__ = events.EventEmitter.prototype;

SocketIOAdapter.prototype.setInfosUsersModule = function (infosUsersModule) {
    var socketIOAdapter = this;
    this.infosUsersModule = infosUsersModule;

    infosUsersModule.on('changeLocalCursorAndSelections', function (data) {
        if(socketIOAdapter.disposed === false) {
            if(socketIOAdapter.socket !== null && socketIOAdapter.socket !== undefined) {
                socketIOAdapter.socket.emit('sendLocalInfosUser', data); 
            }
        }
    });

    infosUsersModule.on('changeLocalUsername', function (data) {
        if(socketIOAdapter.disposed === false) {
            if(socketIOAdapter.socket !== null && socketIOAdapter.socket !== undefined) {
                socketIOAdapter.socket.emit('sendLocalUsername', data);
            }
        }
    });
};

SocketIOAdapter.prototype.createSocket = function () {
    var socketIOAdapter = this;
    var connOptions = {
        'sync disconnect on unload': true
    };

    this.socket = io.connect(location.origin, connOptions);

    this.socket.on('sendDoc', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('receiveDoc', data);
        }
    });

    this.socket.on('broadcastOps', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('receiveOps', data);
        }
    });

    this.socket.on('broadcastCollaboratorCursorAndSelections', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('changeCollaboratorCursorAndSelections', data);
        }
    });
    
    this.socket.on('broadcastCollaboratorUsername', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('changeCollaboratorUsername', data);
        }
    });
    
    this.socket.on('broadcastParole', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('receiveParole', data);
        }
    }); 

    this.coordinator.on('operations', function (logootSOperations) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.send(logootSOperations);
        }
    });

    this.coordinator.on('disconnect', function () {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.toOfflineMode();
        }
    });

    this.socket.on('connect', function () {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('connect');
        }
    });

    this.socket.on('disconnect', function () {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('disconnect');
        }
    });


    this.socket.on('userJoin', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('receiveUserJoin', data);
        }
    });

    this.socket.on('userLeft', function (data) {
        if(socketIOAdapter.disposed === false) {
            socketIOAdapter.emit('receiveUserLeft', data);
        }
    });
};

SocketIOAdapter.prototype.toOnlineMode = function () {
    if(this.socket === null) {
        // First time we connect to the server
        this.createSocket();
    }
    else if(this.connectionCreated === false) {
        // First connexion
        this.connectionCreated = true;
        this.socket.socket.connect();
    }
    else {
        this.socket.socket.reconnect();
    }
};

SocketIOAdapter.prototype.toOfflineMode = function () {
    if(this.socket !== null && this.socket !== undefined) {
        this.socket.disconnect();
    }
};

SocketIOAdapter.prototype.send = function (logootSOperations) {
    var socketIOAdapter = this;
    var obj = {
        'logootSOperations': logootSOperations,
        'lastModificationDate': new Date()
    };
    if(this.socket.socket.connected === true) {
        this.socket.emit('sendOps', obj, function (result) {
            if(result.error === false) {
                socketIOAdapter.emit('ack', { length: result.length });
            }
        });
    }
};

SocketIOAdapter.prototype.onCoordinatorDisposedHandler = function () {
    var key;

    this.emit('networkDisposed');

    if(this.socket !== null && this.socket !== undefined) {
        this.socket.disconnect();
    }

    for(key in this) {
        if(this.hasOwnProperty(key) === true) {
            if(key === 'disposed') {
                this.disposed = true;
            }
            else {
                this[key] = null;
            }
        }
    }
};

module.exports = SocketIOAdapter;

},{"events":7}],7:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],8:[function(_dereq_,module,exports){
/*
 *	Copyright 2014 Matthieu Nicolas
 *
 *	This program is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU General Public License as published by
 *	the Free Software Foundation, either version 3 of the License, or
 * 	(at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU General Public License for more details.
 *
 *	You should have received a copy of the GNU General Public License
 *	along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
module.exports = _dereq_('./lib/index');

},{"./lib/index":12}],9:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */

var Identifier = function(base, u) {
    this.base = base || null;
    this.last = u || 0;
};

var compareTo = function(s1, s2) {
    while (s1.hasNext() && s2.hasNext()) {
        var b1 = s1.next();
        var b2 = s2.next();
        if (b1 < b2) {
            return -1;
        }
        if (b1 > b2) {
            return 1;
        }
    }
    /* s1 is longer than s2 */
    if (s1.hasNext()) {
        return 1;
    }
    /* s2 is longer than s1 */
    if (s2.hasNext()) {
        return -1;
    }
    // Both identifiers have same size
    return 0;
};

Identifier.prototype.compareTo = function(t) {
    if(t!=null)
        return compareTo(this.iterator(), t.iterator());
};

Identifier.prototype.equals = function(o) {
    if(this == o) return true;
    if(typeof(o) != typeof(this) || o == null) return false;

    if (this.base != null ? !this.base.equals(o.base) : o.base != null) return false;
    if (this.last != null ? this.last != o.last : o.last != null) return false;

    return true;
};

Identifier.prototype.hashCode = function() {
    var result = this.base != null ? this.base.hashCode() : 0;
    result = 31 * result + (this.last != null ? this.last : 0);
    return result;
};

Identifier.prototype.iterator = function() {
    var it = new Iterator(Utils.iterator(this.base), this.last);
    return it;
};

Identifier.prototype.toString = function() {
    return "Identifier{" + this.base + "," + this.last + '}';
};

Identifier.prototype.copy = function() {
    return new Identifier(Utils.copy(this.base), this.last);
};

Identifier.prototype.hasPlaceAfter = function(next, length) {
    var max = length + this.last;

    var i = Utils.iterator(this.base);
    var i2 = next.iterator();
    while(i.hasNext() &&  i2.hasNext()) {
        if(i.next() != i2.next())
            return false
    }

    if(i2.hasNext)
        return i2.next() >= max;
    else
        return true;
};

Identifier.prototype.hasPlaceBefore = function(prev, length) {
    var min = this.last - length;
    var i = Utils.iterator(this.base);
    var i2 = Utils.iterator(prev);
    while (i.hasNext() && i2.hasNext()) {
        if (i.next() != i2.next())
            return true;
    }

    if (i2.hasNext())
        return i2.next() < min;
    else
        return true;
};

Identifier.prototype.minOffsetAfterPrev = function (prev, min) {
    var i = Utils.iterator(this.base);
    var i2 = Utils.iterator(prev.iterator);
    while (i.hasNext() && i2.hasNext()) {
        if (i.next() != i2.next())
            return min;
    }

    if (i2.hasNext()) {
        return Math.max(i2.next(), min + 1);
    }
    else {
        return min;
    }
};

Identifier.prototype.maxOffsetBeforeNex = function (next, max) {
    var i = Utils.iterator(this.base);
    var i2 = Utils.iterator(next);
    while (i.hasNext() && i2.hasNext()) {
        if (i.next() != i2.next()) {
            return max;
        }
    }

    if (i2.hasNext())
        return Math.min(i2.next(), max);
    else
        return max;
};

module.exports = Identifier;

},{}],10:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var IdentifierInterval = function(base, begin, end) {
	this.base = base || [];
	this.begin = begin || 0;
	this.end = end || 0;
};

IdentifierInterval.prototype.copy = function() {
	return new IdentifierInterval(Utils.copy(this.base), this.begin, this.end);
};

IdentifierInterval.prototype.getBaseId = function (u) {
	return new Identifier(this.base, u);
};

IdentifierInterval.prototype.addBegin = function (begin) {
	this.begin += begin;
};

IdentifierInterval.prototype.addEnd = function (end) {
	this.end += end;
};

IdentifierInterval.prototype.getBeginId = function () {
	return new Identifier(this.base, this.begin);
};

IdentifierInterval.prototype.getEndId = function () {
	return new Identifier(this.base, this.end);
};

IdentifierInterval.prototype.equals = function (o) {
	if(this==o) return true;
	if(typeof(o) != typeof(this)) return false;

	if(o.begin!=this.begin) return false;
	if(o.end!=this.end) return false;
	if (this.base != null ? !this.base.equals(o.base) : o.base != null) return false;

	return true;
};

IdentifierInterval.prototype.hashCode = function () {
	var result = this.base != null ? base.hashCode() : 0;
    result = 31 * result + this.begin;
    result = 31 * result + this.end;
    return result;
};

IdentifierInterval.prototype.toString = function () {
	return 'IdentifierInterval{[' + this.base + '],[' + this.begin + '..' + this.end + ']}';
}

module.exports = IdentifierInterval;

},{}],11:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
module.exports = {
    createBetweenPosition: function (id1, id2, replicaNumber, clock) {
        var s1 = new InfiniteString(Number.MIN_VALUE, id1 != null ? id1.iterator() : null);
        var s2 = new InfiniteString(Number.MAX_VALUE, id2 != null ? id2.iterator() : null);



        var sb = [];

        do {
            var b1 = s1.next();
            var b2 = s2.next();
            if (b2 - b1 > 2) {
                //if (replicaNumber <= b1 || replicaNumber >= b2) {
                var r = (Math.random() * (b2 - b1 - 2)) + b1 + 1;
                sb.push(r);
                //}
                break;
            }
            else {
                sb.push(b1);
            }
        } while(true);
        sb.push(replicaNumber);
        sb.push(clock);
        return sb;
    }
};

},{}],12:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
 module.exports = {
    "Identifier"     : _dereq_('./identifier'),
    "IdentifierInterval"     : _dereq_('./identifierinterval'),
    "IDFactory"     : _dereq_('./idfactory'),
    "InfiniteString"      : _dereq_('./infinitestring'),
    "Iterator"    : _dereq_('./iterator'),
    "IteratorHelperIdentifier" : _dereq_('./iteratorhelperidentifier'),
    "LogootSAdd"  : _dereq_('./logootsadd'),
    "LogootSBlock"  : _dereq_('./logootsblock'),
    "LogootSDel"  : _dereq_('./logootsdel'),
    "LogootSRopes"  : _dereq_('./logootsropes'),
    "ResponseIntNode"  : _dereq_('./responseintnode'),
    "RopesNodes"  : _dereq_('./ropesnodes'),
    "TextDelete": _dereq_('./textdelete'),
    "TextInsert"    : _dereq_('./textinsert')
};

},{"./identifier":9,"./identifierinterval":10,"./idfactory":11,"./infinitestring":13,"./iterator":14,"./iteratorhelperidentifier":15,"./logootsadd":16,"./logootsblock":17,"./logootsdel":18,"./logootsropes":19,"./responseintnode":20,"./ropesnodes":21,"./textdelete":22,"./textinsert":23}],13:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var InfiniteString = function(ch, it) {
	this.ch = ch || null;
	this.it = it || null;
};

InfiniteString.prototype.hasNext = function () {
	return true;
};

InfiniteString.prototype.next = function () {
	if(this.it != null  && this.it.hasNext())
		return this.it.next();
	else
		return this.ch;
};

module.exports = InfiniteString;

},{}],14:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var Iterator = function (it, more) {
	this.it = it || null;
	this.more = more || 0;
	this.nexte = 'a';
	this.loadNext();
};

Iterator.prototype.loadNext = function () {
	if(this.it.hasNext()) {
		this.nexte = this.it.next();
	}
	else {
		this.nexte = this.more;
		this.more = null;
	}
};

Iterator.prototype.hasNext = function () {
	return this.nexte!=null;
};

Iterator.prototype.next = function () {
	var ret = this.nexte;
	this.loadNext();
	return ret;
};

module.exports = Iterator;

},{}],15:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var IteratorHelperIdentifier = function (id1, id2) {
    this.id1 = id1;
    this.id2 = id2;
    this.nextOffset = null;
    this.result = null;
};

IteratorHelperIdentifier.prototype.compareBase = function () {
    var b1 = Utils.iterator(this.id1.base);
    var b2 = Utils.iterator(this.id2.base);

    while (b1.hasNext() && b2.hasNext()) {
        var i1 = b1.next();
        var i2 = b2.next();
        if (i1 > i2) {
            return Utils.Result.B1AfterB2;
        }
        else if (i1 < i2) {
            return Utils.Result.B1BeforeB2;
        }
    }
    if (b1.hasNext()) { //b2 is shorter than b1
        this.nextOffset = b1.next();
        if (this.nextOffset < this.id2.begin) {
            return Utils.Result.B1BeforeB2;
        }
        else if (this.nextOffset >= this.id2.end) {
            return Utils.Result.B1AfterB2;
        }
        else {
            return Utils.Result.B1InsideB2;
        }
    }
    else if (b2.hasNext()) { //b1 is shorter than b2
        this.nextOffset = b2.next();
        if (this.nextOffset < this.id1.begin) {
            return Utils.Result.B1AfterB2;
        }
        else if (this.nextOffset >= this.id1.end) {
            return Utils.Result.B1BeforeB2;
        }
        else {
            return Utils.Result.B2InsideB1;
        }
    }
    else { // both bases have the same size
        if (this.id1.end + 1 == this.id2.begin) {
            return Utils.Result.B1ConcatB2;
        }
        else if (this.id1.begin == this.id2.end + 1) {
            return Utils.Result.B2ConcatB1;
        }
        else if (this.id1.end < this.id2.begin) {
            return Utils.Result.B1BeforeB2;
        }
        else {
            return Utils.Result.B1AfterB2;
        }
    }
};

IteratorHelperIdentifier.prototype.computeResults = function() {
    if(this.result == null)
        this.result = this.compareBase();
    return this.result;
};

module.exports = IteratorHelperIdentifier;

},{}],16:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var LogootSAdd = function (id, l) {
	this.id = id || null;
	this.l = l || '';
};

LogootSAdd.prototype.copy = function () {
	var o = new LogootSAdd();
	o.id = this.id.copy();
	o.l = this.l;
	return o;
};

LogootSAdd.prototype.execute = function (doc) {
	var args = {
		'id': this.id,
		'str': this.l
	};
	return doc.addBlock(args);
};

module.exports = LogootSAdd;

},{}],17:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
 var LogootSBlock = function(id, list) {
	this.id = id || null;
	this.nbElement = list || 0;
	this.mine = false;
};

/**
 *
 */
LogootSBlock.prototype.addBlock = function(pos, length) {
    this.nbElement += length;
    this.id.begin = Math.min(this.id.begin, pos);
    this.id.end = Math.max(this.id.end, pos + length - 1);
};

/**
 *
 */
LogootSBlock.prototype.delBlock = function(begin, end, nbElement) {
	this.nbElement -= nbElement;
};

/**
 *
 */
LogootSBlock.prototype.copy = function() {
	return new LogootSBlock(this.id.copy(), this.nbElement);
};

LogootSBlock.prototype.copyFromJSON = function (block) {
	var base = Utils.copy(block.id.base);
	this.id = new IdentifierInterval(base, block.begin, block.end);
};

/**
 *
 */
LogootSBlock.prototype.toString = function() {
	return '{' + this.nbElement + ',' + this.id.toString() + ', ' + (this.mine ? 'mine' : 'its') + '}';
};

module.exports = LogootSBlock;

},{}],18:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var LogootSDel = function (lid) {
	this.lid = [];
	for(var i=0; i<lid.length; i++) {
		var id = new IdentifierInterval(lid[i].base, lid[i].begin, lid[i].end);
		this.lid.push(id);
	}
};

LogootSDel.prototype.copy = function () {
	var o = new LogootSDel();
	o.lid = [];
	for(var i=0; i<this.lid.length; i++) {
		o.lid.push(lid[i].copy());
	}
	return o;
};

LogootSDel.prototype.execute = function (doc) {
	var l = [];
	for(var i=0; i<this.lid.length; i++) {
        Utils.pushAll(l, doc.delBlock(this.lid[i]));
    }
    return l;
};

module.exports = LogootSDel;

},{}],19:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
 Utils = _dereq_('mute-utils');

Identifier = _dereq_('./identifier');
IdentifierInterval = _dereq_('./identifierinterval');
IDFactory = _dereq_('./idfactory');
InfiniteString = _dereq_('./infinitestring');
Iterator = _dereq_('./iterator');
IteratorHelperIdentifier = _dereq_('./iteratorhelperidentifier');
LogootSAdd = _dereq_('./logootsadd');
LogootSBlock = _dereq_('./logootsblock');
LogootSDel = _dereq_('./logootsdel');
ResponseIntNode = _dereq_('./responseintnode');
RopesNodes = _dereq_('./ropesnodes');
TextDelete = _dereq_('./textdelete');
TextInsert = _dereq_('./textinsert');

var LogootSRopes = function (replicaNumber) {
    this.replicaNumber = replicaNumber || 0;
    this.clock = 0;
    this.root = null;
    this.mapBaseToBlock= {};
    this.str = '';
};

LogootSRopes.prototype.getBlock = function (id) {
    var ret = this.mapBaseToBlock[Utils.replaceDots(''+id.base)];
    if(ret==null) {
        ret = new LogootSBlock(id);
        this.mapBaseToBlock[Utils.replaceDots(''+id.base)] = ret;
    }
    return ret;
};


//TODO: implémenter les LogootSOperations
LogootSRopes.prototype.addBlock = function (args) {
    if(args['idi'] != null
        && args['str'] != null
        && args['from'] != null
        && args['startOffset'] != null) {

        var idi = args['idi'];
        var str = args['str'];
        var from = args['from'];
        var startOffset = args['startOffset'];

        var path = [];
        var path2 = [];
        var result = [];
        var con = true;
        var i = startOffset;
        while (con) {
            path.push(from);
            var ihi = new IteratorHelperIdentifier(idi,
                    from.getIdentifierInterval());
            var split;
            switch (ihi.computeResults()) {
            case Utils.Result.B1AfterB2:
                if (from.right == null) {
                    var args2 = {
                        'length': str.length,
                        'offset': idi.begin,
                        'block': this.getBlock(idi)
                    };
                    from.right = new RopesNodes(args2);
                    i = i + from.getSizeNodeAndChildren(0) + from.length;
                    result.push(new TextInsert(i, str));
                    con = false;
                }
                else {
                    i = i + from.getSizeNodeAndChildren(0) + from.length;
                    from = from.right;
                }
                break;
            case Utils.Result.B1BeforeB2:
                if (from.left == null) {
                    var args2 = {
                        'length': str.length,
                        'offset': idi.begin,
                        'block': this.getBlock(idi)
                    };
                    from.left = new RopesNodes(args2);
                    result.push(new TextInsert(i, str));
                    con = false;
                }
                else {
                    from = from.left;
                }
                break;
            case Utils.Result.B1InsideB2: // split b2 the object node
                split = Math.min(from.maxOffset(), ihi.nextOffset);
                var args2 = {
                        'length': str.length,
                        'offset': idi.begin,
                        'block': this.getBlock(idi)
                };
                var rp = new RopesNodes(args2);
                var args2 = {
                    'node': rp,
                    'size': split - from.offset + 1
                };
                path.push(from.split(args2));
                i = i + from.getSizeNodeAndChildren(0);
                result.push(new TextInsert(i + split - from.offset + 1, str));
                con = false;
                break;
            case Utils.Result.B2InsideB1: // split b1 the node to insert
                var split2 = /* Math.min(idi.getEnd(), */ihi.nextOffset/* ) */;
                var ls = str.substr(0, split2 + 1 - idi.begin);
                var idi1 = new IdentifierInterval(idi.base,
                        idi.begin, split2);
                if (from.left == null) {
                    var args2 = {
                        'length': ls.length,
                        'offset': idi1.begin,
                        'block': this.getBlock(idi1),
                    };
                    from.left = new RopesNodes(args2);
                    result.push(new TextInsert(i, ls));
                }
                else {
                    var args2 = {
                        'idi': idi1,
                        'str': ls,
                        'from': from.left,
                        'startOffset': i
                    };
                    Utils.pushAll(result, this.addBlock(args2));
                }

                // i=i+ls.size();

                ls = str.substr(split2 + 1 - idi.begin, str.length);
                idi1 = new IdentifierInterval(idi.base, split2 + 1, idi.end);
                i = i + from.getSizeNodeAndChildren(0) + from.length;
                if (from.right == null) {
                    var args2 = {
                        'length': ls.length,
                        'offset': idi1.begin,
                        'block': this.getBlock(idi1)
                    };
                    from.right = new RopesNodes(args2);
                    result.push(new TextInsert(i, ls));
                }
                else {
                    var args2 = {
                        'idi': idi1,
                        'str': ls,
                        'from': from.right,
                        'startOffset': i
                    };
                    Utils.pushAll(result, this.addBlock(args2));
                }
                con = false;
                break;
            case Utils.Result.B1ConcatB2: // node to insert concat the node
                if (from.left != null) {
                    path2 = Utils.copy(path);
                    path2.push(from.left);
                    this.getXest(Utils.RopesNodes.RIGHT, path2);

                    split = from.getIdBegin().minOffsetAfterPrev(
                            Utils.getLast(path2).getIdEnd(), idi.begin);
                    var l = str.substr(split - idi.begin, str.length);
                    from.appendBegin(l.length);
                    result.push(new TextInsert(i + from.getSizeNodeAndChildren(0), l));

                    this.ascendentUpdate(path, l.length);
                    str = str.substr(0, split - idi.begin);
                    idi = new IdentifierInterval(idi.base, idi.begin, split - 1);

                    // check if previous is smaller or not
                    if (idi.end >= idi.begin) {
                        from = from.left;
                    }
                    else {
                        con = false;
                        break;
                    }
                }
                else {
                    result.push(new TextInsert(i, str));
                    from.appendBegin(str.length);
                    this.ascendentUpdate(path, str.length);
                    con = false;
                    break;
                }

                break;
            case Utils.Result.B2ConcatB1:// concat at end
                if (from.right != null) {
                    path2 = Utils.copy(path);
                    path2.push(from.right);
                    this.getXest(Utils.RopesNodes.LEFT, path2);

                    split = from.getIdEnd().maxOffsetBeforeNex(
                            Utils.getLast(path2).getIdBegin(), idi.end);
                    var l = str.substr(0, split + 1 - idi.begin);
                    i = i + from.getSizeNodeAndChildren(0) + from.length;
                    from.appendEnd(l.length);
                    result.push(new TextInsert(i, l));

                    this.ascendentUpdate(path, l.length);
                    str = str.substr(split + 1 - idi.begin, str.length);
                    idi = new IdentifierInterval(idi.base, split + 1, idi.end);
                    if (idi.end >= idi.begin) {
                        from = from.right;
                        i = i + l.length;
                    }
                    else {
                        con = false;
                        break;
                    }
                }
                else {
                    i = i + from.getSizeNodeAndChildren(0) + from.length;
                    result.push(new TextInsert(i, str));
                    from.appendEnd(str.length);
                    this.ascendentUpdate(path, str.length);
                    con = false;
                    break;
                }

                break;
            default:
                console.log("Not implemented yet");
                return -1;
            }
        }
        this.balance(path);
        return result;
    }
    else if(args['id'] != null && args['str'] != null) {
        var id = args['id'];
        var str = args['str'];
        var l = [];
        var idi = new IdentifierInterval(id.base, id.last,
                id.last + str.length - 1);
        if (this.root == null) {
            var bl = new LogootSBlock(idi);
            this.mapBaseToBlock[Utils.replaceDots(''+bl.id.base)] = bl;
            var args2 = {
                        'length': str.length,
                        'offset': id.last,
                        'block': bl
            };
            this.root = new RopesNodes(args2);
            l.push(new TextInsert(0, str));
            return l;
        }
        else {
            var args2 = {
                'idi': idi,
                'str': str,
                'from': this.root,
                'startOffset': 0
            };
            return this.addBlock(args2);
        }
    }
};

LogootSRopes.prototype.searchFull = function (node, id, path) {
    if(node == null)
        return false;
    path.push(node);
    if(node.getIdBegin().toCompare(id) == 0
        || this.searchFull(node.left, id, path)
        || this.searchFull(node.right, id, path)) {
        return true;
    }
    path.pop();
    return false;
};

LogootSRopes.prototype.mkNode = function (id1, id2, length) {
    var base = IDFactory.createBetweenPosition(id1, id2, this.replicaNumber, this.clock++);
    var idi = new IdentifierInterval(base, 0, length - 1);
    var newBlock = new LogootSBlock(idi);
    this.mapBaseToBlock[Utils.replaceDots(''+idi.base)] = newBlock;
    var args = {
        'length': length,
        'offset': 0,
        'block': newBlock
    };
    return new RopesNodes(args);
};

LogootSRopes.prototype.insertLocal = function (pos, l) {
    if(this.root == null) {// empty tree
        this.root = this.mkNode(null, null, l.length);
        this.root.block.mine = true;
        this.str = Utils.insert(this.str, pos, l);
        return new LogootSAdd(this.root.getIdBegin(), l);
    }
    else {
        var newNode;
        var length = this.viewLength();
        this.str = Utils.insert(this.str, pos, l);
        var path;
        if(pos == 0) {// begin of string
            path = [];
            path.push(this.root);
            var args = {
                'i': Utils.RopesNodes.LEFT,
                'path': path
            };
            var n = this.getXest(args);
            if (n.isAppendableBefore()) {
                var id = n.appendBegin(l.length);
                this.ascendentUpdate(path, l.length);
                return new LogootSAdd(id, l);
            }
            else {// add node
                newNode = this.mkNode(null, n.getIdBegin(), l.length);
                newNode.block.mine = true;
                n.left = newNode;
            }
        }
        else if(pos >= length) {// end
            path = [];
            path.push(this.root);
            var args = {
                'i': Utils.RopesNodes.RIGHT,
                'path': path
            };
            var n = this.getXest(args);
            if (n.isAppendableAfter()) {// append
                var id = n.appendEnd(l.length);
                this.ascendentUpdate(path, l.length);
                return new LogootSAdd(id, l);
            }
            else {// add at end
                newNode = this.mkNode(n.getIdEnd(), null, l.length);
                newNode.block.mine = true;
                n.right = newNode;
            }
        }
        else {// middle
            var args = {'pos': pos};
            var inPos = this.search(args);
            if(inPos.i > 0) {// split
                var id1 = inPos.node.block.id.getBaseId(inPos.node.offset + inPos.i - 1);
                var id2 = inPos.node.block.id.getBaseId(inPos.node.offset + inPos.i);
                newNode = this.mkNode(id1, id2, l.length);
                newNode.block.mine = true;
                path = inPos.path;
                var args = {
                    'size': inPos.i,
                    'node': newNode
                };
                path.push(inPos.node.split(args));
            }
            else {
                var args = {'pos': pos - 1};
                var prev = this.search(args);
                if(inPos.node.isAppendableBefore()
                        && inPos.node
                                .getIdBegin()
                                .hasPlaceBefore(prev.node.getIdEnd(),
                                        l.length)) {// append before
                    var id = inPos.node.appendBegin(l.length);
                    this.ascendentUpdate(inPos.path, l.length);

                    return new LogootSAdd(id, l);
                }
                else {
                    if (prev.node.isAppendableAfter()
                            && prev.node
                                    .getIdEnd()
                                    .hasPlaceAfter(
                                            inPos.node.getIdBegin(),
                                            l.length)) {// append after
                        var id = prev.node.appendEnd(l.length);
                        this.ascendentUpdate(prev.path, l.length);

                        return new LogootSAdd(id, l);
                    }
                    else {
                        newNode = this.mkNode(prev.node.getIdEnd(), inPos
                                .node.getIdBegin(), l.length);
                        newNode.block.mine = true;
                        newNode.right = prev.node.right;
                        prev.node.right = newNode;
                        path = prev.path;
                        path.push(newNode);
                    }
                }
            }
        }
        this.balance(path);

        return new LogootSAdd(newNode.getIdBegin(), l);
    }
};

LogootSRopes.prototype.getXest = function (args) {
    if(args['i']!=null && args['n']!=null)
    {
        var i = args['i'];
        var n = args['n'];
        while (n.getChild(i) != null) {
            n = n.getChild(i);
        }
        return n;
    }
    else if(args['i']!=null && args['path']!=null)
    {
        var i = args['i'];
        var path = args['path'];
        var n = path[path.length-1];
        while (n.getChild(i) != null) {
            n = n.getChild(i);
            path.push(n);
        }
        return n;
    }
};

LogootSRopes.prototype.search = function (args) {
    if(args['id']!=null && args['path']!=null)
    {
        var id = args['id'];
        var path = args['path'];
        var i = 0;

        var node = this.root;
        while(node != null) {
            path.push(node);
            if(id.compareTo(node.getIdBegin()) < 0) {
                node = node.left;
            }
            else if(id.compareTo(node.getIdEnd()) > 0) {
                i = i + node.getSizeNodeAndChildren(0) + node.length;
                node = node.right;
            }
            else {
                i = i + node.getSizeNodeAndChildren(0);
                return i;
            }
        }
        return -1;

    }
    else if(args['pos']!=null)
    {
        var pos = args['pos'];

        var node = this.root;
        var path = [];
        while(node != null) {
            path.push(node);

            var before = node.left == null ? 0 : node.left.sizeNodeAndChildren;

            if(pos < before) {
                node = node.left;
            }
            else if(pos < before + node.length) {
                return new ResponseIntNode(pos - before, node, path);
            }
            else {
                pos -= before + node.length;
                node = node.right;
            }
        }
        return null;
    }
};

LogootSRopes.prototype.ascendentUpdate = function (path, length) {
    for (var i = path.length - 1; i >= 0; i--) {
        path[i].addString(length);
    }
};

LogootSRopes.prototype.delBlock = function (id) {
    var l = [];
    var i;
    while (true) {
        var path = [];
        var args = {
            'id': id.getBeginId(),
            'path': path
        }
        if((i = this.search(args)) == -1) {
            if (id.begin < id.end) {
                id = new IdentifierInterval(id.base, id.begin + 1,
                        id.end);
            }
            else {
                return l;
            }
        }
        else {
            var node = Utils.getLast(path);
            var end = Math.min(id.end, node.maxOffset());
            var pos = i + id.begin - node.offset;
            var length = end - id.begin + 1;
            l.push(new TextDelete(pos, length));
            var t = node.deleteOffsets(id.begin, end);
            if (node.length == 0) {// del node
                this.delNode(path);
            }
            else if (t != null) {
                path.push(t);
                this.balance(path);
            }
            else {
                this.ascendentUpdate(path, id.begin - end - 1);
            }
            if (end == id.end) {
                break;
            }
            else {
                id = new IdentifierInterval(id.base, end, id.end);
            }
        }
    }
    return l;
};


LogootSRopes.prototype.delLocal = function (begin, end) {
    this.str = Utils.del(this.str, begin, end);
    var length = end - begin + 1;
    var li = [];
    do {
        var args = {'pos': begin};
        var start = this.search(args);
        if(start!=null) {
            var be = start.node.offset + start.i;
            var en = Math.min(be + length - 1, start.node.maxOffset());
            li.push(new IdentifierInterval(start.node.block.id.base, be, en));
            var r = start.node.deleteOffsets(be, en);
            length -= en - be + 1;

            if (start.node.length == 0) {
                this.delNode(start.path);
            }
            else if (r != null) {// node has been splited
                start.path.push(r);
                this.balance(start.path);
            }
            else {
                this.ascendentUpdate(start.path, be - en - 1);
            }
        }
        else
            length=0;
    } while (length > 0);

    return new LogootSDel(li);
};

LogootSRopes.prototype.delNode = function (path) {
    var node = Utils.getLast(path);
    if (node.block.nbElement == 0) {
        this.mapBaseToBlock[Utils.replaceDots(''+node.block.id.base)]=null;
    }
    if (node.right == null) {
        if (node == this.root) {
            this.root = node.left;
        } else {
            path.pop();
            Utils.getLast(path).replaceChildren(node, node.left);
        }
    } else if (node.left == null) {
        if (node == this.root) {
            this.root = node.right;
        } else {
            path.pop();
            Utils.getLast(path).replaceChildren(node, node.right);
        }
    } else {// two children
        path.push(node.right);
        var min = this.getMinPath(path);
        node.become(min);
        path.pop();
        Utils.getLast(path).replaceChildren(min, min.right);
    }
    this.balance(path);
};

LogootSRopes.prototype.getMinPath = function (path) {
    var node = Utils.getLast(path);
    if (node == null) {
        return null;
    }
    while (node.left != null) {
        node = node.left;
        path.push(node);
    }
    return node;
};

LogootSRopes.prototype.getLeftest = function (node) {
    if (node == null) {
        return null;
    }
    while (node.left != null) {
        node = node.left;
    }
    return node;
};

LogootSRopes.prototype.getMinId = function (node) {
    var back = this.getLeftest(node);
    return back != null ? back.getIdBegin() : null;
};

//TODO: Implémenter la balance de Google (voir AVL.js) et vérifier ses performances en comparaison
LogootSRopes.prototype.balance = function (path) {
    var node = path.length == 0 ? null : path.pop();
    var father = path.length == 0 ? null : Utils.getLast(path);
    while (node != null) {
        node.sumDirectChildren();
        var balance = node.balanceScore();
        while (Math.abs(balance) >= 2) {
            if (balance >= 2) {
                if (node.right != null && node.right.balanceScore() <= -1) {
                    father = this.rotateRL(node, father);// double left
                }
                else {
                    father = this.rotateLeft(node, father);
                }
            }
            else {
                if (node.left != null && node.left.balanceScore() >= 1) {
                    father = this.rotateLR(node, father);// Double right
                }
                else {
                    father = this.rotateRight(node, father);
                }
            }
            path.push(father);
            balance = node.balanceScore();
        }

        node = path.length == 0 ? null : path.pop();
        father = path.length == 0 ? null : Utils.getLast(path);
    }
};

LogootSRopes.prototype.rotateLeft = function (node, father) {
    var r = node.right;
    if (node == this.root) {
        this.root = r;
    }
    else {
        father.replaceChildren(node, r);
    }
    node.right = r.left;
    r.left = node;
    node.sumDirectChildren();
    r.sumDirectChildren();
    return r;
};

LogootSRopes.prototype.rotateRight = function (node, father) {
    var r = node.left;
    if (node == this.root) {
        this.root = r;
    }
    else {
        father.replaceChildren(node, r);
    }
    node.left = r.right;
    r.right = node;
    node.sumDirectChildren();
    r.sumDirectChildren();
    return r;
};

LogootSRopes.prototype.rotateRL = function (node, father) {
    this.rotateRight(node.right, node);
    return this.rotateLeft(node, father);
};

LogootSRopes.prototype.rotateLR = function (node, father) {
    this.rotateLeft(node.left, node);
    return this.rotateRight(node, father);
};

LogootSRopes.prototype.getNext = function (path) {
    var node = Utils.getLast(path);
    if (node.right == null) {
        if (path.length > 1) {
            var father = path.get(path.length - 2);
            if (father.left == node) {
                path.pop();
                return true;
            }
        }
        return false;
    }
    else {
        path.push(node.right);
        var args = {
            'i': Children.LEFT,
            'path': path
        };
        this.getXest(args);
        return true;
    }
};

LogootSRopes.prototype.duplicate = function (newReplicaNumber) {
    var copy = this.copy();
    copy.replicaNumber = newReplicaNumber;
    copy.clock = 0;
    return copy;
}

LogootSRopes.prototype.copy = function () {
    var o = new LogootSRopes(this.replicaNumber);
    o.str = this.str;
    o.clock = this.clock;
    o.root = this.root != null ? this.root.copy() : null;
    o.mapBaseToBlock = {};
    for (var key in this.mapBaseToBlock)
    {
        o.mapBaseToBlock[key] = this.mapBaseToBlock[key];
    }
    return o;
};

LogootSRopes.prototype.copyFromJSON = function(ropes) {
    var key;

    this.str = ropes.str;
    for(key in ropes.mapBaseToBlock) {
        this.mapBaseToBlock[key] = ropes.mapBaseToBlock[key];
    }
    if(ropes.root !== null && ropes.root !== undefined) {
        var node = ropes.root;
        var args = {
            'block': null,
            'offset': node.offset,
            'length': node.length
        };
        this.root = new RopesNodes(args);
        this.root.copyFromJSON(node);
    }
};

LogootSRopes.prototype.view = function () {
    return this.str;
};

LogootSRopes.prototype.viewLength = function () {
    return this.str.length;
};

module.exports = LogootSRopes;

},{"./identifier":9,"./identifierinterval":10,"./idfactory":11,"./infinitestring":13,"./iterator":14,"./iteratorhelperidentifier":15,"./logootsadd":16,"./logootsblock":17,"./logootsdel":18,"./responseintnode":20,"./ropesnodes":21,"./textdelete":22,"./textinsert":23,"mute-utils":24}],20:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var ResponseIntNode = function (i, node, path) {
	this.i = i || 0;
	this.node = node || null;
	this.path = path || null;
};

module.exports = ResponseIntNode;

},{}],21:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var RopesNodes = function (args) {
	this.block = args.block || null;
	this.offset = args.offset || 0;
	this.length = args.length || 0;
	this.sizeNodeAndChildren = this.length;
	this.left = null;
	this.right = null;
	this.height = 1;
	var newer = args.newer;
	if(newer == null) {
		newer = true;
	}
	if(newer && this.block != null) {
		try {
			this.block.addBlock(this.offset, this.length);
		}
		catch (e) {
			console.error('---- Exception dans new RopesNodes lors d\'addBlock ----');
			console.error('Args : ', args);
			console.error('Newer : ', newer);
			console.error('This : ', this);
		}
	}
};

RopesNodes.prototype.getIdBegin = function () {
	return this.block.id.getBaseId(this.offset);
};

RopesNodes.prototype.getIdEnd = function () {
	return this.block.id.getBaseId(this.offset + this.length - 1);
};

RopesNodes.prototype.copy = function() {
	var args =  {
		block: this.block !== null ? this.block.copy() : null,
		offset: this.offset,
		length: this.length,
	}
	var o = new RopesNodes(args);
	o.height = this.height;
	o.left = this.left != null ? this.left.copy() : null;
	o.right = this.right != null ? this.right.copy() : null;

	return o;
};

RopesNodes.prototype.addString = function (length) {
	this.sizeNodeAndChildren += length;
};

RopesNodes.prototype.getChild = function (i) {
	if(i == Utils.RopesNodes.RIGHT)
		return this.right;
	if(i == Utils.RopesNodes.LEFT)
		return this.left;
};

RopesNodes.prototype.appendEnd = function (length) {
	var b = this.maxOffset() + 1;
	this.length += length;
	this.block.addBlock(b, length);
	return this.block.id.getBaseId(b);
};

RopesNodes.prototype.appendBegin = function (length) {
	this.offset -= length;
	this.length += length;
	this.block.addBlock(this.offset, length);
	return this.getIdBegin();
};

RopesNodes.prototype.deleteOffsets = function (begin, end) {
	var sizeToDelete = end - begin + 1;
	this.block.delBlock(begin, end, sizeToDelete);
	if (sizeToDelete == this.length) {
		this.length = 0;
		return null;
	}
	var ret = null;
	if (end == this.offset + this.length - 1) {
		this.length = begin - this.offset;
	}
	else if (begin == this.offset) {
		this.length = this.length - end + this.offset - 1;
		this.offset = end + 1;
	}
	else {
		var args = {'size': end - this.offset + 1};
		ret = this.split(args);
		this.length = begin - this.offset;
	}
	return ret;
};

RopesNodes.prototype.split = function (args) {
	if(args['node']!=null && args['size']!=null)
	{
		var node = args['node'];
		var size = args['size'];
		this.height++;
		var args2 = {
			'size': size
		};
		var n = this.split(args2);
		n.left = node;
		n.height++;
		return n;
	}
	else if(args['size']!=null)
	{
		var size = args['size'];
		this.height++;
		var args2 = {
			length: this.length - size,
			offset: this.offset + size,
			block: this.block,
			newer: false
		};
		var n = new RopesNodes(args2);
		this.length = size;
		if (this.right != null) {
			n.right = this.right;
			n.height += n.right.height + 1;
			n.sizeNodeAndChildren += n.right.sizeNodeAndChildren;
		}
		this.right = n;
		return n;
	}
};

RopesNodes.prototype.maxOffset = function() {
	return this.offset + this.length - 1;
};

RopesNodes.prototype.sumDirectChildren = function () {
	this.height = Math.max(this.getSubtreeHeight(Utils.RopesNodes.LEFT), this.getSubtreeHeight(Utils.RopesNodes.RIGHT)) + 1;
	this.sizeNodeAndChildren = this.getSizeNodeAndChildren(Utils.RopesNodes.LEFT) + this.getSizeNodeAndChildren(Utils.RopesNodes.RIGHT) + this.length;
};

RopesNodes.prototype.getSubtreeHeight = function (i) {
	var s = this.getChild(i);
	return s == null ? 0 : s.height;
};

RopesNodes.prototype.getSizeNodeAndChildren = function (i) {
	var s = this.getChild(i);
	return s == null ? 0 : s.sizeNodeAndChildren;
};

RopesNodes.prototype.replaceChildren = function (node, by) {
	if (this.left == node) {
		this.left = by;
	}
	else if (this.right == node) {
		this.right = by;
	}
};

RopesNodes.prototype.balanceScore = function () {
	return this.getSubtreeHeight(Utils.RopesNodes.RIGHT) - this.getSubtreeHeight(Utils.RopesNodes.LEFT);
};

RopesNodes.prototype.become = function (node) {
	this.sizeNodeAndChildren = -this.length + node.length;
	this.length = node.length;
	this.offset = node.offset;
	this.block = node.block;
};

RopesNodes.prototype.isAppendableAfter = function () {
	return this.block.mine && this.block.id.end == this.maxOffset();
};

RopesNodes.prototype.isAppendableBefore = function () {
	return this.block.mine && this.block.id.begin == this.offset;
};

RopesNodes.prototype.toString = function () {
	return new IdentifierInterval(this.block.id.base,
		this.offset, this.maxOffset()).toString() + ',';
};

RopesNodes.prototype.viewRec = function () {
	var str2 = '';
	if (this.left != null || this.right != null) {
		str2 += '( ';
	}
	if (this.left != null) {
		str2 += this.left.viewRec();
	}
	if (this.left != null || this.right != null) {
		str2 += ' //,// ';
	}
	str2 += this.str;
	if (this.left != null || this.right != null) {
		str2 += ' \\\\,\\\\ ';
	}
	if (this.right != null) {
		str2 += this.right.viewRec();
	}
	if (this.left != null || this.right != null) {
		str2 += ' )';
	}
	return str2;
};

RopesNodes.prototype.getIdentifierInterval = function () {
	return new IdentifierInterval(this.block.id.base, this.offset, this.offset + this.length - 1);
};

RopesNodes.prototype.copyFromJSON = function (node) {
	this.height = node.height;
	this.sizeNodeAndChildren = node.sizeNodeAndChildren;

	if(node.block !== null && node.block !== undefined) {
		this.block = new LogootSBlock(null, node.block.nbElement);
		this.block.copyFromJSON(node.block);
	}
	if(node.left !== null && node.left !== undefined) {
        var args = {
            block: null,
            offset: node.left.offset,
            length: node.left.length
        };
        this.left = new RopesNodes(args);
		this.left.copyFromJSON(node.left);
	}
	if(node.right !== null && node.right !== undefined) {
        var args = {
            block: null,
            offset: node.right.offset,
            length: node.right.length
        };
        this.right = new RopesNodes(args);
		this.right.copyFromJSON(node.right);
	}
};

module.exports = RopesNodes;

},{}],22:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var TextDelete = function (offset, length) {
	this.offset = offset || 0;
	this.length = length || 0;
};

TextDelete.prototype.applyTo = function (doc) {
	return doc.delLocal(this.offset, this.offset + this.length - 1);
};

module.exports = TextDelete;

},{}],23:[function(_dereq_,module,exports){
/*
 *  Copyright 2014 Matthieu Nicolas
 *
 *  This file is part of Mute-structs.
 *
 *  Mute-structs is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Mute-structs is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Mute-structs.  If not, see <http://www.gnu.org/licenses/>.
 */
var TextInsert = function (offset, content)  {
	this.offset = offset || 0;
	this.content = content || null;
};

TextInsert.prototype.applyTo = function (doc) {
	return doc.insertLocal(this.offset, this.content);
};

module.exports = TextInsert;

},{}],24:[function(_dereq_,module,exports){
/*
 *	Copyright 2014 Matthieu Nicolas
 *
 *	This program is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU General Public License as published by
 *	the Free Software Foundation, either version 3 of the License, or
 * 	(at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU General Public License for more details.
 *
 *	You should have received a copy of the GNU General Public License
 *	along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

module.exports = {
	Result: {
		B1AfterB2: 'B1AfterB2',
		B1BeforeB2: 'B1BeforeB2',
		B1InsideB2: 'B1InsideB2',
		B2InsideB1: 'B2InsideB1',
		B1ConcatB2: 'B1ConcatB2',
		B2ConcatB1: 'B2ConcatB1'
	},
	RopesNodes: {
		LEFT: 0,
		RIGHT: 1
	},
	insert: function (s, index, string) {
		if (index > 0) {
			return s.substring(0, index) + string + s.substring(index, s.length);
		}
		return string + s;
	},
	del: function (s, begin, end) {
	    var str = '';
	    if(begin !== 0) {
	        str = s.substring(0, begin);
	    }
		return str + s.substring(end + 1, s.length);
	},
	unset: function (arr, elt) {
		var index = arr.indexOf(elt);
	    if(index > -1) {
	        arr.splice(index, 1);
	    }
	},
	pushAll: function(arr, elts) {
		var i;
		for(i=0; i<elts.length; i++) {
			arr.push(elts[i]);
		}
	},
	iterator: function(arr) {
		var it = {
	    	index: 0,
	    	items: arr, 
	    	first: function() {
	        	this.reset();
	        	return this.next();
		    },
		    next: function() {
		        return this.items[this.index++];
		    },
		    hasNext: function() {
		        return this.index < this.items.length;
		    },
		    reset: function() {
		        this.index = 0;
		    },
	    };
	    return it;
	},
	getLast: function (arr) {
		return arr[arr.length-1];
	},
	copy: function (arr) {
		var copy = [];
		var i;
		for(i=0; i<arr.length; i++) {
			if(typeof arr[i] === "number" || typeof arr[i] === "string") {
				copy.push(arr[i]);
			}
			else if(arr[i] !== null && arr[i] !== undefined && arr[i].copy !== null && arr[i].copy !== undefined) {
				copy.push(arr[i].copy());
			}
			else {
				copy.push(arr[i]);
			}
		}
		return copy;
	},
	occurrences: function (string, subString, allowOverlapping) {
	    var n;
	    var pos;
	    var step;

	    string += ""; 
	    subString += "";
	    if(subString.length<=0) {
	    	return string.length+1;
	    } 
	    n = 0;
	    pos = 0;
	    step = (allowOverlapping) ? (1) : (subString.length);

	    while(true) {
	        pos = string.indexOf(subString,pos);
	        if(pos>=0) { 
	        	n++; 
	        	pos += step; 
	        } 
	        else {
	        	break;
	        }
	    }
	    return(n);
	},
	// MongoDB can't store keys containing dots so have to replace it
	replaceDots: function (str) {
		var find = '\\.';
		var re = new RegExp(find, 'g');
		return str.replace(re, 'U+FF0E');
	}
};
},{}]},{},[1])
(1)
});