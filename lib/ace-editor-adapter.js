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

var events = require('events');

var AceEditorAdapter = function (itemID, coordinator) {
	var aceEditorAdapter = this;
	var style = document.createElement('style');
	
	this.coordinator = coordinator;
	this.currentMarkers = [];
	this.userInfosChanged = false;
	this.mousePos = null;

	Range = ace.require('ace/range').Range;

	style.type = 'text/css';
	style.innerHTML = '.editor { margin-left: 15px; margin-top: 15px; width: 100%; height: 400px; overflow: visible}';
	document.getElementsByTagName('head')[0].appendChild(style);

	document.getElementById(itemID).className = 'editor';

	this.editor = ace.edit(itemID);

	this.editor.setTheme('ace/theme/dawn');
	this.editor.getSession().setTabSize(4);
	this.editor.getSession().setUseWrapMode(true);

	this.editor.on('changeSelection', function () {
		aceEditorAdapter.userInfosChanged = true;
	});

	this.editor.on('mousemove', function (e) {
		aceEditorAdapter.mousePos = aceEditorAdapter.editor.renderer.screenToTextCoordinates(e.clientX, e.clientY);
		aceEditorAdapter.updateVisibleNames();
	});

	if(this.coordinator !== null) {
		this.coordinator.on('initEditor', function (data) {
			aceEditorAdapter.init(data);
		});
		this.coordinator.on('update', function (data) {
			aceEditorAdapter.update(data);
		});
	}

	this.toEditionMode();

	this.editor.session.on('changeScrollTop', function (e) {
		aceEditorAdapter.emit('scroll', { topRow: aceEditorAdapter.editor.renderer.getScrollTopRow() });
    });
};

AceEditorAdapter.prototype.__proto__ = events.EventEmitter.prototype;

AceEditorAdapter.prototype.init = function (data) {
	var aceEditorAdapter = this;
	var flag = false;
	this.update(data);

	setInterval(function () {
		var index;// = aceEditorAdapter.editor.session.doc.positionToIndex(aceEditorAdapter.editor.getCursorPosition());
		var aceSelections;// = aceEditorAdapter.editor.session.getSelection();
		var i;
		var selections = [];
		var indexStart;
		var indexEnd;

		if(flag === false && aceEditorAdapter.userInfosChanged === true) {
			index = aceEditorAdapter.editor.session.doc.positionToIndex(aceEditorAdapter.editor.getCursorPosition());
			aceSelections = aceEditorAdapter.editor.session.getSelection();
			flag = true;
			if(aceSelections !== null && aceSelections !== undefined && !aceSelections.isEmpty()) {
				if(!aceSelections.inMultiSelectMode) {
					if(aceSelections.isBackwards()) {
						indexStart = aceEditorAdapter.editor.session.doc.positionToIndex(aceSelections.lead);
						indexEnd = aceEditorAdapter.editor.session.doc.positionToIndex(aceSelections.anchor);
					}
					else {
						indexStart = aceEditorAdapter.editor.session.doc.positionToIndex(aceSelections.anchor);
						indexEnd = aceEditorAdapter.editor.session.doc.positionToIndex(aceSelections.lead);
					}
					selections.push({ start: indexStart, end: indexEnd });
				}
			}
			aceEditorAdapter.emit('infosUser', { infosUser: { indexCursor: index, selections: selections } });
			aceEditorAdapter.userInfosChanged = false;
			flag = false;
		}
	}, 250);
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

    this.emit('change', { action: action, index: index, text: text });
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

	var doc = this.editor.session.doc;
	var index = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
	var selection = this.editor.getSelection();
	var indexStartSelection;
	var indexEndSelection;
	var posStartSelection;
	var posEndSelection;
	var ranges = [];
	var selectionTemp;
	var topRow = this.editor.renderer.getScrollTopRow() + data.diffNbLines;
	var totalDiffCursor = 0;
	var i, j;
	var pos; 
	var operation;


	for(i=0; i<data.operations.length; i++) {
		operation = data.operations[i];
		if(operation.offset < index) {
			index += operation.diffCursor;
		}
	}

	if(!selection.isEmpty()) {
		if(!selection.inMultiSelectMode) {
			if(selection.isBackwards()) {
				indexStartSelection = doc.positionToIndex(selection.lead);
				indexEndSelection = doc.positionToIndex(selection.anchor);
			}
			else {
				indexStartSelection = doc.positionToIndex(selection.anchor);
				indexEndSelection = doc.positionToIndex(selection.lead);
			}
			ranges.push(this.updateSelection(indexStartSelection, indexEndSelection, data.operations));
		}
	}
	this.editor.setValue(data.str);	

	pos = this.editor.session.doc.indexToPosition(index, 0)
	this.editor.navigateTo(pos.row, pos.column);

	selection.ranges = [];
	selection.rangeCount = 0;
	for(i=0; i<ranges.length; i++) {
		posStartSelection = doc.indexToPosition(ranges[i][0]);
		posEndSelection = doc.indexToPosition(ranges[i][1]);

		selection.setSelectionRange(new Range(posStartSelection.row, posStartSelection.column, posEndSelection.row, posEndSelection.column));
	}

	this.editor.renderer.scrollToLine(topRow, false, true);

	this.userInfosChanged = true;
};

AceEditorAdapter.prototype.updateSelection = function (indexStart, indexEnd, operations) {
	var i;

	for(i=0; i<operations.length; i++) {
		operation = operations[i];
		if(operation.offset < indexStart) {
			indexStart += operation.diffCursor;
		}
		if(operation.offset < indexEnd) {
			indexEnd += operation.diffCursor;
		}
	}

	return [indexStart, indexEnd];
}

AceEditorAdapter.prototype.clearRemoteIndicators = function () {
	var i;

	for(i=0; i<this.currentMarkers.length; i++) {
		this.editor.session.removeMarker(this.currentMarkers[i]);
	}
};

AceEditorAdapter.prototype.addRemoteCursor = function (indexCursor, userID, cssClasses) {
	var posCursor = this.editor.session.doc.indexToPosition(indexCursor);
	var range = new Range(posCursor.row, posCursor.column, posCursor.row, posCursor.column+1);

	this.currentMarkers.push(this.editor.session.addMarker(range, '', function (html, range, left, top, config) {
		var div = '<div id="cursor-'+userID+'" data-remote-cursor="true" data-remote-cursor-row="'+posCursor.row+'" data-remote-cursor-column="'+posCursor.column+'" class="'+cssClasses+'" style="height: 12px; width:300px; top:'+(top)+'px; left:'+left+'px;">'+
			'<div class="nubbin" style="bottom: '+0+'px; top:-4px;"></div>'+
			'<div class="name" style="display: none; bottom: 4px">Utilisateur '+userID+'</div>' +
			'</div>';
		html.push(div);
		return html;
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
	this.editor.removeAllListeners('change');
	this.coordinator.removeAllListeners('update');
	this.editor.setReadOnly(true);
};

AceEditorAdapter.prototype.toEditionMode = function () {
	var aceEditorAdapter = this;

	this.editor.on('change', function (e) {
		aceEditorAdapter.onChangeAdapter(e);
	});

	if(this.coordinator !== null && this.coordinator !== undefined) {
		this.coordinator.on('update', function (data) {
			aceEditorAdapter.update(data);
		});	
	}
	this.editor.setReadOnly(false);
};

module.exports = AceEditorAdapter;