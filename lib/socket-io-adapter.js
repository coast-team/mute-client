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

var events = require('events');

var SocketIOAdapter = function (coordinator) {
	var socketIOAdapter = this;

	this.coordinator = coordinator;
	this.socket = null;

	this.coordinator.on('initNetwork', function (data) {
		socketIOAdapter.init(data);
	});
	this.coordinator.on('operations', function (logootSOperations) {
		socketIOAdapter.send(logootSOperations);
	});
};

SocketIOAdapter.prototype.__proto__ = events.EventEmitter.prototype;

SocketIOAdapter.prototype.init = function(data) {
	var socketIOAdapter = this;

    var connOptions = {
        'sync disconnect on unload': true
    };

	this.socket = io.connect(location.origin, connOptions);

    this.socket.on('sendDoc', function (json) {
        socketIOAdapter.emit('receiveDoc', json);
    });

    this.socket.on('broadcastOps', function (json) {
        socketIOAdapter.emit('receiveOps', json.logootSOperations);
    });

    this.socket.emit('joinDoc', { docID: data.docID });
};

SocketIOAdapter.prototype.send = function (logootSOperations) {
    var socketIOAdapter = this;
    var obj = {
        "logootSOperations": logootSOperations
    };
    if(this.socket.socket.connected === true) {
        this.socket.emit('sendOps', obj, function (result) {
            if(result.error === false) {
                socketIOAdapter.emit('ack', {length: result.length});
            }
        });
    }
};

module.exports = SocketIOAdapter;
