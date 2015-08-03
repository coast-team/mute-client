var events = require('events');

/*
Data Object
event : message context
data : message content
 */

var Data = function(event, data){
    this.event = event;
    this.data = data;
};

/*
PeerInfo Object
Informations about remote peer
connection : connection between the current and the remote peer
replicaNumber : replica number of the remote peer
 */

var PeerInfo = function(connection){
    this.connection = connection;
    this.replicaNumber = null;
};

PeerInfo.prototype.setReplicaNumber = function(replicaNumber){
    this.replicaNumber = replicaNumber;
};

/*
PeerIOAdapter Object
Initialize and manage web p2p network
 */

var PeerIOAdapter = function(coordinator){
    var peerIOAdapter = this;

    this.coordinator = coordinator; // coordinator of the current peer
    this.peer = null; //peer object from peerJS API http://peerjs.com/
    this.peers = []; //list of remote peers
    this.peerId = null; //peerId of the current peer
    this.socketServer = null;
    this.connectionCreated = false;
    this.infosUsersModule = null;
    this.disposed = false;
    this.joinDoc = false;
    this.first = false;
    this.replicaNumber = null; //replica number of the current peer
    this.username = null; //username of current peer
    this.defaultInfoUsers = null; //defaultInfosUsers genrated at the connection initialization

    this.coordinator.on('initNetwork', function (data) {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.toOnlineMode();
        }
    });

    this.coordinator.on('queryDoc', function (data) {
        if(peerIOAdapter.disposed === false) {
            data.username = peerIOAdapter.infosUsersModule.getUsername();
        }
    });

    this.coordinator.on('coordinatorDisposed', function (data) {
        if(peerIOAdapter.disposed === false) {
            peerIOAdapter.onCoordinatorDisposedHandler(data);
        }
    });
    this.coordinator.on('doc', function (args){
        //Give a copy of the document
        console.log(args);
        msg = {
            ropes: args.ropes,
            history: args.history,
            bufferLogootSOp: args.bufferLogootSOp,
            creationDate: args.creationDate,
            lastModificationDate: args.lastModificationDate
        };

        var data = JSON.stringify(new Data('sendDoc', msg));

        var connection = peerIOAdapter.getPeer(args.callerID );
        console.log(connection);
        if(connection !== null){
            connection.send(data);
        }

    });


    this.coordinator.on('initDoc', function (args){
        msg = {
            ropes: args.ropes,
            history: args.history,
            bufferLogootSOp: args.bufferLogootSOp,
            creationDate: args.creationDate,
            lastModificationDate: args.lastModificationDate
        };
        peerIOAdapter.emit('receiveDoc', msg);
    });
};

PeerIOAdapter.prototype.__proto__ = events.EventEmitter.prototype;


PeerIOAdapter.prototype.setInfosUsersModule = function(infosUsers){
    var peerIOAdapter = this;
    this.infosUsersModule = infosUsersModule;

    infosUsersModule.on('changeLocalCursorAndSelections', function (data) {
        data.replicaNumber = peerIOAdapter.replicaNumber;
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                var newData = JSON.stringify(new Data('broadcastCollaboratorCursorAndSelections', data));
                peerIOAdapter.peers[i].connection.send(newData);
            }
        }
    });

    infosUsersModule.on('changeLocalUsername', function (data) {
        data.replicaNumber = peerIOAdapter.replicaNumber;
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                var newData = JSON.stringify(new Data('broadcastCollaboratorUsername', data));
                peerIOAdapter.peers[i].connection.send(newData);
            }
        }
    });

};

PeerIOAdapter.prototype.createSocket = function () {
    var peerIOAdapter = this;
    this.peers = [];// empty the remote peers list
    var connOptions = {
        'sync disconnect on unload': true
    };

    this.socketServer = io.connect(location.origin, connOptions);
    /*
    You can use the signaling server set up on the mute server demo, to do that, you have just to uncomment the two following lines and comment the third
    WARNING : some troubles were encountred with firefox browser
    */
    //var peerServerId = Math.floor(Math.random()*100000).toString();
    //this.peer = new Peer(peerServerId, {host: '/', port: 8080, path: '/peerjs'}); //signaling server on mute demo server
    this.peer = new Peer({key: 'lwjd5qra8257b9', debug : true}); // actually using a foreign signaling server
    this.peer.on('open', function(id){
        peerIOAdapter.peerId = id;
        var infoPeer = {
            docID : peerIOAdapter.coordinator.docID,
            peerID : id
        };
        peerIOAdapter.socketServer.emit('newPeer', infoPeer);
    });

    function connect (connection){ //Initialize connection with remote peer
        console.log('connection');
        if(!peerIOAdapter.peerAlreadyExists(connection)){
            console.log(connection);

            var peerInfo = new PeerInfo(connection);
            peerIOAdapter.peers.push(peerInfo);

            connection.on('data', handleEvent); // data receiving

            connection.on('close', function(){
                //connection closing
                var replicaNumber = peerIOAdapter.getReplicaNumber(connection.peer);
                peerIOAdapter.emit('removeUser', replicaNumber);
                this.close();
                var index = peerIOAdapter.peers.indexOf(this);
                peerIOAdapter.peers.splice(index, 1);
            });

            if(!peerIOAdapter.joinDoc && !peerIOAdapter.first){
                peerIOAdapter.joinDoc = true;
                var msg = JSON.stringify(new Data('joinDoc', peerIOAdapter.peerId));
                connection.send(msg);
            }
            var data = {
                peerId : peerIOAdapter.peerId,
                replicaNumber : peerIOAdapter.replicaNumber,
                username : peerIOAdapter.username
            };
            var request = JSON.stringify(new Data('queryUserInfo', data));
            connection.send(request);
        }
    }

    function handleEvent(args){
        //manage data receiving
        console.log('HandleEvent');
        console.log(args);
        try{
            var data = JSON.parse(args);
            if(data.event !== null && data.event !== undefined && peerIOAdapter.disposed === false){
                switch(data.event){
                    case 'sendOps':
                        data.data.replicaNumber = peerIOAdapter.replicaNumber;
                        peerIOAdapter.emit('receiveOps', data.data);
                        break;
                    case 'sendDoc':
                            data.data.replicaNumber = peerIOAdapter.replicaNumber;
                            data.data.infosUsers = peerIOAdapter.defaultInfoUsers;
                            console.log('receiveOps');
                            peerIOAdapter.emit('receiveDoc', data.data);
                            peerIOAdapter.emit('receiveDocPeer', data.data);
                        break;
                    case 'queryUserInfo' :
                        var peerId = data.data.peerId;
                        peerIOAdapter.emit('addUser', data.data.replicaNumber, data.data.username);
                        peerIOAdapter.setReplicaNumber(data.data.peerId, data.data.replicaNumber);
                        data = {
                            peerId : peerIOAdapter.peerId,
                            replicaNumber : peerIOAdapter.replicaNumber,
                            username : peerIOAdapter.username
                        };
                        var msg = JSON.stringify(new Data('addUser', data));
                        var connection = peerIOAdapter.getPeer(peerId );
                        if(connection !== null){
                            connection.send(msg);
                        }
                        break;
                    case 'addUser' :
                        console.log('addUser');
                        peerIOAdapter.setReplicaNumber(data.data.peerId, data.data.replicaNumber);
                        peerIOAdapter.emit('addUser', data.data.replicaNumber, data.data.username);
                        break;
                    case 'broadcastCollaboratorCursorAndSelections':
                        peerIOAdapter.emit('changeCollaboratorCursorAndSelections', data.data);
                        break;
                    case 'broadcastCollaboratorUsername' :
                        peerIOAdapter.emit('changeCollaboratorUsername', data.data);
                        break;
                    case 'broadcastParole' :
                        peerIOAdapter.emit('receiveParole', data.data);
                        break;
                    case 'connect' :
                        peerIOAdapter.emit('connect');
                        break;
                    case 'userJoin' :
                        peerIOAdapter.emit('receiveUserJoin', data.data);
                        break;
                    case 'userLeft' :
                        peerIOAdapter.emit('receiveUserLeft', data.data);
                        break;
                    case 'joinDoc' :
                        peerIOAdapter.coordinator.giveCopy(data.data);
                        break;
                    default :
                        console.log('handleEvent : ERROR !');
                        break;
                }
            }
        }catch(e){
            console.log('ERROR JSON PARSING');
        }

    }

    function addCollaborator(remoteId){
        var connection = peerIOAdapter.peer.connect(remoteId);
        console.log("Add collaborator");
        console.log(connection);
        connection.on('open', function() {
            console.log('OPEN');
            connect(connection);
        });
    }

    this.socketServer.on('infoPeerIDs', function(infoPeerIds){
        /* Receiving informations from server
            infoPeerIds = {
                peers : [], //remote peers already connected to the room
                replicaNumber //replica number of the current peer given by the server
            }
         */
        peerIOAdapter.emit('connect');
        console.log(infoPeerIds);

        var peerIds = infoPeerIds.peers;

        peerIOAdapter.replicaNumber = infoPeerIds.replicaNumber;
        peerIOAdapter.username = "User " + peerIOAdapter.replicaNumber;

        peerIOAdapter.defaultInfoUsers = {};
        peerIOAdapter.defaultInfoUsers[peerIOAdapter.replicaNumber] = {
                cursorIndex: 0,
                selections: [],
                username: peerIOAdapter.username
            };

        if(peerIds.length === 0){
            peerIOAdapter.first = true;
            peerIOAdapter.joinDoc = true;
            peerIOAdapter.coordinator.giveCopy(null);

            var data = {};
            data.replicaNumber = peerIOAdapter.replicaNumber;
            data.infosUsers = peerIOAdapter.defaultInfoUsers;
            peerIOAdapter.emit('receiveDocPeer', data);
        }
        for(var i = 0; i < peerIds.length; i++){
            console.log('Add Peer : ' + peerIds[i]);
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
        this.peers[i].connection.close();
    }
    this.peers = [];
};

PeerIOAdapter.prototype.send = function (logootSOperations) {
    var socketIOAdapter = this;
    var obj = {
        'logootSOperations': logootSOperations,
        'lastModificationDate': new Date()
    };
    var data = new Data('sendOps', obj);
    var newData = JSON.stringify(data);
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(newData);
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

PeerIOAdapter.prototype.getPeer = function(peerId) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            return this.peers[i].connection;
        }
    }
    return null;
};

PeerIOAdapter.prototype.getReplicaNumber = function(peerId) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            console.log(this.peers[i]);
            return this.peers[i].replicaNumber;
        }
    }
    return null;
};

PeerIOAdapter.prototype.setReplicaNumber = function(peerID, replicaNumber) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerID){
            this.peers[i].setReplicaNumber(replicaNumber);
            break;
        }
    }
};

module.exports = PeerIOAdapter;
