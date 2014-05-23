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
	
	Range = ace.require('ace/range').Range;

	style.type = 'text/css';
	style.innerHTML = '.editor { margin-left: 15px; margin-top: 15px; width: 100%; height: 400px; }';
	document.getElementsByTagName('head')[0].appendChild(style);

	document.getElementById(itemID).className = 'editor';

	this.editor = ace.edit(itemID);

	this.editor.setTheme('ace/theme/dawn');
	this.editor.getSession().setTabSize(4);
	this.editor.getSession().setUseWrapMode(true);

	this.coordinator = coordinator;
	this.coordinator.on('initEditor', function (data) {
		aceEditorAdapter.init(data);
	});
	this.coordinator.on('update', function (data) {
		aceEditorAdapter.update(data);
	});
};

AceEditorAdapter.prototype.__proto__ = events.EventEmitter.prototype;

AceEditorAdapter.prototype.init = function (data) {
	var aceEditorAdapter = this;
	this.update(data);

	this.editor.on('change', function (e) {
		aceEditorAdapter.onChangeAdapter(e);
	});

	this.editor.session.on('changeScrollTop', function (e) {
		aceEditorAdapter.emit('scroll', { topRow: aceEditorAdapter.editor.renderer.getScrollTopRow() });
    });

	setInterval(function () {
		var index = aceEditorAdapter.editor.session.doc.positionToIndex(aceEditorAdapter.editor.getCursorPosition());
		aceEditorAdapter.emit('cursor', { index: index });
	}, 100);


};

AceEditorAdapter.prototype.onChangeAdapter = function (e) {
	var data = e.data;
    var i;
    var action;
    var index = this.editor.session.doc.positionToIndex(data.range.start, 0);
    var text = '';

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

		if(!selection.isEmpty()) {
			if(selection.inMultiSelectMode) {
				for(j=0; j<selection.ranges.length; j++) {
					selectionTemp = selection.ranges[j];
					indexStartSelection = doc.positionToIndex(selectionTemp.start);
					indexEndSelection = doc.positionToIndex(selectionTemp.end);
					if(operation.offset < indexStartSelection) {
						indexStartSelection += operation.diffCursor;
					}
					if(operation.offset < indexEndSelection) {
						indexEndSelection += operation.diffCursor;
					}
					ranges.push([indexStartSelection, indexEndSelection]);
				}
			}
			else {
				console.log('On est dans le mode 1 sélection');
				indexStartSelection = doc.positionToIndex(selection.anchor);
				indexEndSelection = doc.positionToIndex(selection.lead);
				if(operation.offset < indexStartSelection) {
					indexStartSelection += operation.diffCursor;
				}
				if(operation.offset < indexEndSelection) {
					indexEndSelection += operation.diffCursor;
				}
				ranges.push([indexStartSelection, indexEndSelection]);
			}
		}

	}
	this.editor.setValue(data.str);	

	pos = this.editor.session.doc.indexToPosition(index, 0)
	this.editor.navigateTo(pos.row, pos.column);

	for(i=0; i<ranges.length; i++) {
		console.log(ranges);
		posStartSelection = doc.indexToPosition(ranges[i][0]);
		posEndSelection = doc.indexToPosition(ranges[i][1]);
		console.log('posStartSelection: ', posStartSelection);
		console.log('posEndSelection: ', posEndSelection);
		selection.addRange(new Range(posStartSelection.row, posStartSelection.column, posEndSelection.row, posEndSelection.column));
	}

	this.editor.renderer.scrollToLine(topRow, false, true);
};

module.exports = AceEditorAdapter;