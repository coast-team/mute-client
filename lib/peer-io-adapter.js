var events = require('events');

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
    this.first = false;

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
            console.log("BOUUH 1 !!");
            console.log(data);
            connection.send(JSON.stringify(data));
        }else{
            console.log("FATAL ERROR !!!");
        }

    });


    this.coordinator.on('initDoc', function (args){
        console.log("BIIIIIIMMMMM");
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
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                var newData = {
                    event : 'broadcastCollaboratorCursorAndSelections',
                    data :  data
                };
                peerIOAdapter.peers[i].send(newData);
            }
        }
    });

    infosUsersModule.on('changeLocalUsername', function (data) {
        if(peerIOAdapter.disposed === false) {
            for (var i = 0; i < peerIOAdapter.peers.length; i++) {
                var newData = {
                    event : 'broadcastCollaboratorUsername',
                    data :  data
                };
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
            console.log("joinDoc val :");
            console.log(peerIOAdapter.joinDoc);
            console.log("first val :");
            console.log(peerIOAdapter.first);
            if(!peerIOAdapter.joinDoc && !peerIOAdapter.first){
                console.log("joinDoc");
                peerIOAdapter.joinDoc = true;
                var msg = {
                    event : 'joinDoc',
                    data : peerIOAdapter.peerId
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

    function handleEvent(args){
        console.log("HANDLE !!!");
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
                        peerIOAdapter.emit('receiveOps', data.data);
                    }
                    break;
                case 'sendDoc':
                    if(peerIOAdapter.disposed === false) {
                        console.log("BOUUH 2 !!");
                        console.log(data.data);
                        peerIOAdapter.emit('receiveDoc', data.data);
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
        connection.on('open', function() {
            connect(connection);
        });
    }

    this.socketServer.on('infoPeerIDs', function(inforPeerIds){
        console.log(inforPeerIds);
        var peerIds = inforPeerIds.peers;
        peerIOAdapter.replicaNumber = inforPeerIds.replicaNumber;
        if(peerIds.length === 0){
            peerIOAdapter.first = true;
            peerIOAdapter.joinDoc = true;
            peerIOAdapter.coordinator.giveCopy(null);
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
        console.log('yolo');
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
    var data = new Data('sendOps', obj);
    var newData = JSON.stringify(data);
    for(var i = 0; i < this.peers.length; i++){
        console.log("coucou");
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

PeerIOAdapter.prototype.getPeer = function(peerID) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peer === peerID){
            return this.peers[i];
        }
    }
    return null;
};

PeerIOAdapter.prototype.join = function () {

};
module.exports = PeerIOAdapter;