var events = require('events');

var HOP = 7;
/*
Useful functions
 */

function makeTag(replicaNumber, clock){
    return replicaNumber + ':' + clock;
}

function isEqualTag(tag1, tag2){
    if(tag1 === tag2){
        return true;
    }else{
        return false;
    }
}

var PeerInfo = function(replicaNumber, connection){
    this.replicaNumber = replicaNumber;
    this.connection = connection || null;
};

var Message = function(replicaNumber, clock, context, data, srcPeerId){
    this.hop = HOP;
    this.tag = makeTag(replicaNumber, clock);
    this.context = context;
    this.data = data;
    this.srcPeerId = srcPeerId; //peerID of emitter
};

Message.prototype.decreaseHop = function () {
  if(this.hop > 0){
    this.hop --;
  }
};

var SCAMP = function(peerIOAdapter, offerRecipients){
    var self = this;

    this.peers = []; //partial view
    this.pendingList = []; //pendingList waiting for response
    this.offerRecipients = offerRecipients;
    this.peerIOAdapter = peerIOAdapter;
    this.clock = 0;
    this.firstConnection = true;
    this.onNetworkMsg = {}; //All msg, send and received

    this.peerIOAdapter.on('launch', function(data){
        //TODO
    });

    this.peerIOAdapter.on('infoServer', function(data){
        //TODO
    });

    this.peerIOAdapter.on('infoUser', function(data){
        //TODO
    });

    this.peerIOAdapter.on('send', function(data){
        self.broadcast(data);
    });

};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.init = function(){
    var self = this;

    function initConnect(connection){
        if(!this.isAlreadyInPeersList(connection.peer) && !this.isAlreadyInPendingList(connection.peer)){
            self.pendingList.push(connection);
            connection.on('data', handleMsg); // data receiving
            connection.on('close', function(){
                //connection closing
                var replicaNumber = self.getReplicaNumber(peerInfo.connection.peer);
                //self.peerIOAdapter.emit('removeUser', replicaNumber);
                self.refreshOfferRecipients();
                self.makeOffer();
                this.close();
                var index = self.peers.indexOf(this);
                self.peers.splice(index, 1);
            });
        }
    }

    function handleMsg(arg){
        try{
            var msg = JSON.parse(arg);
            if(msg.context !== null && msg.context !== undefined && !this.isKnownMsg(msg)){
                this.pushMsg(msg);
                switch(msg.context){
                    case 'offer':
                        this.forwardOffer(msg);
                        break;
                    case 'broadcastMsg':
                        break;
                    case 'acceptOffer':
                        this.onOfferAccepted(msg);
                        break;
                    case 'removeUser':
                        break;
                    case 'broadcastInfoUser':
                        break;
                    default :
                        console.log("ERREUR SCAMP received undefined context");
                        break;
                }
            }
        }catch(e){
            console.log("Not a valid JSON");
        }
    }

    if(this.firstConnection){
        this.firstConnection = false;
        this.makeOffer();
    }

    this.peerIOAdapter.peer.on('connection', initConnect);

    //faire une offre
};

//Get remonte connection already saved in pending list
//And remove it from pendingList

SCAMP.prototype.getConnection = function(peerId){
    for(var i = 0; i < this.pendingList.length; i++){
        if(this.pendingList[i].peer === peerId){
            var res = this.pendingList[i];
            this.pendingList.splice(i,1);
            return res;
        }
    }
    return null;
};

SCAMP.prototype.isAlreadyInPartialView = function(replicaNumber){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].replicaNumber == replicaNumber){
            return true;
        }
    }
    return false;
};

SCAMP.prototype.isAlreadyInPendingList = function (replicaNumber) {
    for (var i = 0; i < this.pendingList.length; i++) {
        if(this.pendingList[i].replicaNumber == replicaNumber){
            return true;
        }
    }
    return false;
};

SCAMP.prototype.isAlreadyInPeersList = function (peerId) {
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peer == peerId){
            return true;
        }
    }
    return false;
};

/*
for a given peerId, returns the replica number of the right peer
*/

SCAMP.prototype.getReplicaNumber = function(peerId){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            console.log(this.peers[i]);
            return this.peers[i].replicaNumber;
        }
    }
    return null;
};


SCAMP.prototype.makeOffer = function(){
    //Création d'un peerInfo avec le replicanumber et tout...
    var self = this;

    this.clock ++;

    var peerInfo = new PeerInfo(replicanumber);
    //InfoUser + peerInfo
    var data = {
        peerId : this.peerIOAdapter.peer.id,
        username : this.peerIOAdapter.username,
        peerInfo : peerInfo
    };
    var msg = JSON.stringify(new Message(this.replicaNumber, this.clock, 'offer', data, this.peerIOAdapter.peer.id));

    for (var i = 0; i < this.offerRecipients.length; i++) {
        sendMsg(this.offerRecipients[i]);
    }

    function sendMsg(remoteId){
        var connection = this.peerIOAdapter.peer.connect(remoteId);
        connection.on('open', function(){
            self.pushMsg(msg);
            connection.send(msg);
        });
    }
};

SCAMP.prototype.onOfferAccepted = function(msg){
    var remoteConnection = this.getConnection(msg.srcPeerId);
    if(msg.data !== null && msg.data !== undefined && remoteConnection !== null && remoteConnection !== undefined){
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
    }
};

SCAMP.prototype.acceptOffer = function(msg){
    var peerInfo = new PeerInfo(this.replicaNumber); //PeerInfo of current node
    var remoteConnection = this.getConnection(msg.srcPeerId);

    if(remoteConnection !== null  && remoteConnection !== undefined){
        this.peerIOAdapter.emit('addUser',msg.data.peerInfo.replicaNumber, msg.data.username);
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
        this.send(peerInfo, 'accept', msg.data.connection);
        console.log('Handshake !!!!!!!!');
    }else{
        console.log('Error accept offer');
    }

};

SCAMP.prototype.broadcastMsg = function(data){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock,'broadcast', data, this.peerIOAdapter.peer.id));
    this.pushMsg(msg);
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.send = function(data, context, connection){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock, data, this.peerIOAdapter.peer.id));
    this.pushMsg(msg);
    connection.send(msg);
};

SCAMP.prototype.forwardOffer = function(msg){
    var p = 1 / (1 + this.getLength());
    if(this.peerIOAdapter.peer.id !== msg.srcPeerId
        && Math.random() <= p
        && ! this.isAlreadyInPartialView(msg.data.replicaNumber)
        && msg.hop < HOP){

        if(msg.data !== null && msg.data !== undefined){
            this.acceptOffer(msg);
        }
    }else{
        if(msg.hop > 0){
            var index = Math.floor(Math.random()*this.getLength());
            msg.decreaseHop();
            this.peers[index].send(msg);
        }
        //retirer de la pending list
        this.getConnection(msg.srcPeerId); //remove from pendingList
    }
};

SCAMP.prototype.forwardBroadcast = function(msg){
    this.emit('broadcast', msg);
    if(msg.hop > 0){
        msg.decreaseHop();
        for (var i = 0; i < this.peers.length; i++) {
            this.peers[i].send(msg);
        }
    }
};

SCAMP.prototype.broadcastInfoUser = function() {
    // TODO
};

SCAMP.prototype.refreshOfferRecipients = function() {
    if(this.peers.length > 0){
        this.offerRecipients = this.peers.slice(0);
    }else{
        /*TODO
        *contacter le serveur et récupérer les autres pairs
        */
    }
};

SCAMP.prototype.isKnownMsg = function (msg) {
    if(msg.tag !== null && msg.tag !== undefined){
        var tag = msg.tag;
        for (var key in this.onNetworkMsg) {
            if(isEqualTag(key, tag)){
                return true;
            }
        }
    }
    return false;
};

SCAMP.prototype.pushMsg = function (msg) {
    this.onNetworkMsg[msg.tag] = msg;
};
