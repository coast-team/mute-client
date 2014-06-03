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

var Utils = require('mute-utils');
var events = require('events');

var LogootSRopes = require('mute-structs').LogootSRopes;
var TextInsert = require('mute-structs').TextInsert;
var TextDelete = require('mute-structs').TextDelete;
var LogootSAdd = require('mute-structs').LogootSAdd;
var LogootSDel = require('mute-structs').LogootSDel;

var Coordinator = function (docID) {
	this.docID = docID;
	this.idLocalStorage = '';

	this.bufferLogootSOp = []; 		// Buffer contenant les LogootSOperations distantes actuellement non traitées
	this.bufferLocalLogootSOp = []; // Buffer contenant les LogootSOperations locales actuellement non ack
	this.bufferTextOp = [];			// Buffer contenant les TextOperations locales actuellement non converties en LogootSOperations
	
	this.prevOp = false;	// Type de la dernière opération
	this.prevOpPos = -1;	// Position de la dernière opération
	this.posCursor = 0;		// Position 'actuelle' du curseur
	this.viewTopRow = 0;	// Numéro de la ligne actuellement au sommet de la vue
	this.busy = false;		// Flag indiquant si l'utilisateur a saisi qqch depuis 1 sec
	this.flag = false;		// Flag évitant d'appeler simultanément plusieurs fois la même fonction
	
	this.ropes = null;
	this.network = null;
	this.editor = null;
	timerTextOp = null;
};

Coordinator.prototype.__proto__ = events.EventEmitter.prototype;

Coordinator.prototype.setEditor = function (editor) {
	var coordinator = this;

	this.editor = editor;
	this.editor.on('change', function (data) {
		coordinator.addBufferTextOp(data);
	});
	this.editor.on('cursor', function (posCursor) {
		coordinator.posCursor = posCursor;
	});
	this.editor.on('scroll', function (viewTopRow) {
		coordinator.viewTopRow = viewTopRow; 
	});
};

Coordinator.prototype.setNetwork = function(network) {
	var coordinator = this;

	this.network = network;
	this.network.on('sendDoc', function(args) {
		coordinator.join(args);
	});
	this.network.on('receiveOps', function(logootSOperations) {
		Utils.pushAll(coordinator.bufferLogootSOp, logootSOperations);
	});
	this.network.on('ack', function(length) {
		coordinator.bufferLocalLogootSOp = coordinator.bufferLocalLogootSOp.splice(length);
	});

	this.emit('initNetwork', { docID: this.docID });
};

Coordinator.prototype.addBufferTextOp = function (data) {
	/**
	 * 	Format attendu de data : 
	 *	data = {
	 *		action: Le type d'action réalisée (insertText, removeText, insertLines, removeLines)
	 * 		index: La position à laquelle l'action a été réalisée dans le texte
	 *		text: Le texte inséré ou supprimé, dans le cas d'un insertText ou removeText
	 * 	}
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
		clearTimeout(timerTextOp);
		timerTextOp = setTimeout(function() {
			console.log('Fin des 1s de buffer, on envoie.');
			coordinator.busy = false;
			coordinator.cleanBufferTextOp();
			timerTextOp = null;
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
			logootSOperations.push(to.applyTo(this.ropes));
		}
		//Il faut maintenant envoyer les logootSOperations générées au serveur et aux autres peers
		if(logootSOperations.length !== 0) {
			//On stocke en local au cas où il y a une déconnexion
			Utils.pushAll(this.bufferLocalLogootSOp, logootSOperations);
			this.emit('operations', logootSOperations);
		}

		content = JSON.parse(localStorage[this.idLocalStorage]);
		content.clock = this.ropes.clock;
		localStorage[this.idLocalStorage] = JSON.stringify(content);
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
	var diffCursor = 0;
	var diffNbLines = Utils.occurrences(this.ropes.str, '\n');

	while(!this.busy && this.flag !== true
		&& this.bufferTextOp.length === 0 && this.bufferLogootSOp.length > 0 ) {
		this.flag = true;
		this.editor.removeAllListeners('change');
		temp = this.bufferLogootSOp.shift();
		if(temp.id !== undefined && temp.l !== undefined && temp.id !== null && temp.l !== null) {
				// Il s'agit d'une insertion distante
				var id = new Identifier(temp.id.base, temp.id.last);
				lo = new LogootSAdd(id, temp.l);
		}
		else if(temp.lid !== undefined && temp.lid !== null) {
			// Il s'agit d'une suppression distante
			var lid = [];
			for(i=0; i<temp.lid.length; i++) {
				lid.push(new IdentifierInterval(temp.lid[i].base, temp.lid[i].begin, temp.lid[i].end));
			}
			lo = new LogootSDel(lid);
		}
		// Chaque LogootSOperation génère un tableau de TextOperations lors de son exécution
		tos = lo.execute(this.ropes);
		for(i=0; i<tos.length; i++)
		{
			to = tos[i];
			// On identifie le type de TextOperation dont il s'agit
			if(to.content !== undefined && to.offset !== null && to.content !== null && to.offset !== null) {
			    // Il s'agit d'une insertion
			    diffCursor = to.content.length;
			    this.ropes.str = Utils.insert(this.ropes.str, to.offset, to.content);
			}
			else if(to.length !== undefined && to.length !== null && to.offset !== undefined && to.offset !== null) {
			    // Il s'agit d'une suppression
			    diffCursor = - to.length;
			    this.ropes.str = Utils.del(this.ropes.str, to.offset, to.offset + to.length - 1);
			}
			operations.push({ offset: to.offset, diffCursor: diffCursor });
		}
		diffNbLines = Utils.occurrences(this.ropes.str, '\n') - diffNbLines;

		this.prevOpPos = -1;
		this.prevOp = false;
		this.flag = false;

		this.emit('update', { str: this.ropes.str, operations: operations, diffNbLines: diffNbLines });
		this.emit('awareness', { nbLogootSOp: this.bufferLogootSOp.length });
		this.editor.on('change', function (data) {
			coordinator.addBufferTextOp(data);
		});
    }
};

Coordinator.prototype.join = function (json) {
	var coordinator = this;

	var temp = [];
	var replicaNumber;
	var clock;
	var content;
	
	if(json.creationDate !== null && json.creationDate !== undefined) {
		this.idLocalStorage = json.creationDate + '_';
	}

	this.idLocalStorage += this.docID;

    if(localStorage[this.idLocalStorage] === null || localStorage[this.idLocalStorage] === undefined) {
		localStorage[this.idLocalStorage] = JSON.stringify({ replicaNumber: json.replicaNumber, clock: 0 });
	}
	else {
		try {
			content = JSON.parse(localStorage[this.idLocalStorage]);
			if(content.replicaNumber === null || content.replicaNumber === undefined
				|| content.clock === null || content.clock === undefined) {
				localStorage[this.idLocalStorage] = JSON.stringify({ replicaNumber: json.replicaNumber, clock: 0 });
			}
		}
		catch (e) {
			localStorage[this.idLocalStorage] = JSON.stringify({ replicaNumber: json.replicaNumber, clock: 0 });
		}
	}

	content = JSON.parse(localStorage[this.idLocalStorage]);

	replicaNumber = content.replicaNumber;
	clock = content.clock;

    this.editor.removeAllListeners('change');

    this.ropes = new LogootSRopes(replicaNumber);
    this.ropes.copyFromJSON(json.ropes);

    this.ropes.clock = clock;

    if(this.bufferLocalLogootSOp.length > 0) {
        Utils.pushAll(temp, this.bufferLocalLogootSOp);
        this.emit('operations', temp);
        Utils.pushAll(this.bufferLogootSOp, this.bufferLocalLogootSOp);
    }

    Utils.pushAll(this.bufferLogootSOp, json.logootSOperations);
    this.bufferLocalLogootSOp = [];

    this.emit('initEditor', { str: this.ropes.str, operations: [] });

    /**
     * Ajout de la fonction générant des TextOperations à partir des saisies de l'utilisateur
     */
    this.editor.on('change', function (data) {
		coordinator.addBufferTextOp(data);
	});

	setInterval(function () {
        coordinator.cleanBufferTextOp();
    }, 250);

    setInterval(function () {
		coordinator.cleanBufferLogootSOp();
	}, 250);
};

Coordinator.prototype.receive = function (logootSOperations) {
    Utils.pushAll(this.bufferLogootSOp, logootSOperations);
    this.emit('awareness', { nbLogootSOp: this.bufferLogootSOp.length });
};

module.exports = Coordinator;