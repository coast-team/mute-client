var events = require('events');

var Data = function(event, data){
    this.event = event;
    this.data = data;
};

var PeerInfo = function(connection){
    this.connection = connection;
    this.replicaNumber = null;
};

PeerInfo.prototype.setReplicaNumber = function(replicaNumber){
    this.replicaNumber = replicaNumber;
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
    this.first = false;
    this.replicaNumber = null;
    this.username = null;
    this.defaultInfoUsers = null;

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
    this.coordinator.on('doc', function (args){
        console.log(args);
        msg = {
            "ropes": args.ropes,
            "history": args.history,
            "bufferLogootSOp": args.bufferLogootSOp,
            "creationDate": args.creationDate,
            "lastModificationDate": args.lastModificationDate
        };

        var data = {};
        data.event = 'sendDoc';
        data.data = msg;

        var connection = peerIOAdapter.getPeer(args.callerID );
        console.log(connection);
        if(connection !== null){
            console.log(data);
            connection.send(JSON.stringify(data));
        }

    });


    this.coordinator.on('initDoc', function (args){
        msg = {
            "ropes": args.ropes,
            "history": args.history,
            "bufferLogootSOp": args.bufferLogootSOp,
            "creationDate": args.creationDate,
            "lastModificationDate": args.lastModificationDate
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
                var newData = {
                    event : 'broadcastCollaboratorCursorAndSelections',
                    data :  data
                };
                var newNewData = JSON.stringify(newData);
                peerIOAdapter.peers[i].connection.send(newNewData);
            }
        }
    });

    infosUsersModule.on('changeLocalUsername', function (data) {
        data.replicaNumber = peerIOAdapter.replicaNumber;
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                var newData = {
                    event : 'broadcastCollaboratorUsername',
                    data :  data
                };
                var newNewData = JSON.stringify(newData);
                peerIOAdapter.peers[i].connection.send(newNewData);
                peerIOAdapter.peers[i].connection.send(newData);
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
        peerIOAdapter.socketServer.emit('newPeer', infoPeer);
    });

    function connect (connection){
        console.log("connection");
        if(!peerIOAdapter.peerAlreadyExists(connection)){
            console.log(connection);

            var peerInfo = new PeerInfo(connection);
            peerIOAdapter.peers.push(peerInfo);
            
            connection.on('data', handleEvent);
            
            connection.on('close', function(){
                console.log("YOLOOOO ");
                console.log(connection.peer);
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
        console.log("HandleEvent");
        console.log(args);
        var data;
        try{
            data = JSON.parse(args);
        }catch(e){
            data = args;
        }
        if(data.event !== null && data.event !== undefined){
            switch(data.event){
                case 'sendOps':
                    if(peerIOAdapter.disposed === false) {
                        data.data.replicaNumber = peerIOAdapter.replicaNumber;
                        peerIOAdapter.emit('receiveOps', data.data);
                    }
                    break;
                case 'sendDoc':
                    if(peerIOAdapter.disposed === false) {
                        console.log(data.data);
                        if(peerIOAdapter.replicaNumber !== null){
                            data.data.replicaNumber = peerIOAdapter.replicaNumber;
                            data.data.infosUsers = peerIOAdapter.defaultInfoUsers;
                        console.log('receiveOps');
                        console.log(data.data);
                        }
                        peerIOAdapter.emit('receiveDoc', data.data);
                        peerIOAdapter.emit('receiveDocPeer', data.data);
                    }
                    break;
                case 'queryUserInfo' :
                    if(peerIOAdapter.disposed === false) {
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
                        console.log(connection);
                        if(connection !== null){
                            connection.send(msg);
                        }
                    }

                    break;
                case 'addUser' :
                    console.log("addUser");
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.setReplicaNumber(data.data.peerId, data.data.replicaNumber);
                        peerIOAdapter.emit('addUser', data.data.replicaNumber, data.data.username);
                    }
                    break;
                case 'broadcastCollaboratorCursorAndSelections':
                    console.log("kikou");
                    if(peerIOAdapter.disposed === false) {
                        peerIOAdapter.emit('changeCollaboratorCursorAndSelections', data.data);
                    }
                    break;
                case 'broadcastCollaboratorUsername' :
                    console.log("kikou2");
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
                    peerIOAdapter.coordinator.giveCopy(data.data);
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
        //var data = new Data('userJoin', )
        connection.on('open', function() {
            connect(connection);
        });
    }

    this.socketServer.on('infoPeerIDs', function(inforPeerIds){
        peerIOAdapter.emit('connect');
        console.log(inforPeerIds);
        var peerIds = inforPeerIds.peers;
        peerIOAdapter.replicaNumber = inforPeerIds.replicaNumber;
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
        console.log(peerIOAdapter.replicaNumber);
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
            console.log("plouf");
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