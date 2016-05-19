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
/*global require, module, setInterval, clearInterval, setTimeout, clearTimeout, console */
"use strict";

var ONLINE_MODE = 0;
var OFFLINE_MODE = 1;

var Utils = require('mute-utils');
var events = require('events');

var IdentifierInterval = require('mute-structs').IdentifierInterval;
var Identifier = require('mute-structs').Identifier;
var LogootSRopes = require('mute-structs').LogootSRopes;
var TextInsert = require('mute-structs').TextInsert;
var TextDelete = require('mute-structs').TextDelete;
var LogootSAdd = require('mute-structs').LogootSAdd;
var LogootSDel = require('mute-structs').LogootSDel;

var Coordinator = function (docID, serverDB) {
    var coordinator = this;

    // Attributes stored into the DB
    this.docID = docID;
    this.creationDate = new Date();
    this.history = [];
    this.lastModificationDate = new Date();
    this.replicaNumber = -1;
    this.clock = 0;
    this.ropes = new LogootSRopes(this.replicaNumber);
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
        console.log("local op !");
        console.log(data);
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
        for(var i=0; i<temp.lid.length; i++) {
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
    if(to.content !== undefined && to.offset !== undefined && to.content !== null && to.offset !== null) {
        // Insertion so have to delete
        str = Utils.del(str, to.offset, to.offset + to.content.length - 1);
    }
    else if(to.length !== undefined && to.length !== null && to.offset !== undefined && to.offset !== null) {
        // Deletion so have to insert
        str = Utils.insert(str, to.offset, to.deletion);
    }
    return str;
};
Coordinator.prototype.giveCopy = function(data) {
    var args = {};
    args.callerID = data;
    args.bufferLogootSOp = this.bufferLogootSOp;
    args.bufferLocalLogootSOp = this.bufferLocalLogootSOp;
    args.ropes = this.ropes;
    args.lastModificationDate = this.lastModificationDate;
    args.creationDate = this.creationDate;
    args.history = this.history;
    console.log("give copy !!");
    console.log(args);
    if(data !== null){
        args.callerID = data;
        this.emit('doc', args);
    }else{
        this.emit('initDoc', args);
    }


};
Coordinator.prototype.join = function (json) {
    console.log("JOIN");
    console.log(json);
    var coordinator = this;

    var temp;

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
    }
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
