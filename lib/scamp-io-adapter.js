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

function setListeners(connection){

};

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
/*
    TODO :
    * implémentation d'un système de hop
*/

var SCAMP = function(replicaNumber, peer, peerIOAdapter, offerRecipients){
    this.peers = []; //partial view
    this.pendingList = []; //pendingList waiting for response
    this.offerRecipients = offerRecipients;
    this.peer = peer; //peerObject
    this.replicaNumber = replicaNumber;
    this.peerIOAdapter = peerIOAdapter;
    this.clock = 0;
    this.firstConnection = true;
};

SCAMP.prototype.__proto__ = events.EventEmitter.prototype;

SCAMP.prototype.init = function(){
    var self =this;

    function initConnect(connection){
        if(!this.isAlreadyInPeersList(connection.peer) && !this.isAlreadyInPendingList(connection.peer)){
            self.pendingList.push(connection);
            peerInfo.connection.on('data', handleMsg); // data receiving
            peerInfo.connection.on('close', function(){
                //connection closing
                var replicaNumber = self.getReplicaNumber(peerInfo.connection.peer);
                //self.peerIOAdapter.emit('removeUser', replicaNumber);
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
            if(msg.context !== null && msg.context !== undefined){
                switch(msg.context){
                    case 'offer':
                        this.forwardOffer(msg);
                        break;
                    case 'broadcast':
                        //this.emit();
                        break;
                    case 'accept':
                        this.onOfferAccepted(msg);
                        break;
                    default :
                        console.log("ERREUR SCAMP receive undefined context");
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

    this.peer.on('connection', initConnect);

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

SCAMP.prototype.isAlreadyInPartialView = function(peerId){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].peer == peerId){
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

SCAMP.prototype.isAlreadyInPendingList = function (replicaNumber) {
    for (var i = 0; i < this.pendingList.length; i++) {
        if(this.pendingList[i].replicaNumber == replicaNumber){
            return true;
        }
    }
    return false;
};

SCAMP.prototype.addPeer = function(msg){
    var self = this;
    var peerInfo = msg.data;

    peerInfo.connection = this.getConnection(msg.srcPeerId);


    if(peerInfo.connection !== null && peerInfo.connection !== undefined){
        connect(peerInfo);
    }else{
        console.log("ERROR GET CONNECTION");
    }
};


SCAMP.prototype.getReplicaNumber = function(peerId){
    for (var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].connection.peer === peerId){
            console.log(this.peers[i]);
            return this.peers[i].replicaNumber;
        }
    }
    return null;
};

SCAMP.prototype.makeOffer = function(msg){
    //Création d'un peerInfo avec le replicanumber et tout...
    var self = this;

    this.clock ++;
    var peerInfo = new PeerInfo(replicanumber);
    var msg = JSON.stringify(new Message(this.replicaNumber, this.clock, 'offer', peerInfo, this.peer.id));
    for (var i = 0; i < this.offerRecipients.length; i++) {
        var connection = this.peer.connect(this.offerRecipients[i]);
        connection.on('open', function(){
            connection.send(msg);
        });
    }
    remoteConnection.send(msg);
};

SCAMP.prototype.onOfferAccepted = function(msg){
    var remoteConnection = this.getConnection(msg.srcPeerId);
    if(msg.data !== null && msg.data !== undefined && remoteConnection !== null && remoteConnection !== undefined){
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(remotePeerInfo);
    }
};

SCAMP.prototype.acceptOffer = function(msg) {
    var peerInfo = new PeerInfo(this.replicaNumber);
    var remoteConnection = this.getConnection(msg.srcPeerId);
    if(remoteConnection !== null  & remoteConnection !== undefined){
        var remotePeerInfo = msg.data;
        remotePeerInfo.connection = remoteConnection;
        this.peers.push(re)
    }
    this.send(peerInfo, 'accept', msg.data.connection);
};

SCAMP.prototype.broadcast = function(data){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock,'broadcast', data, this.peer.id));
    for(var i = 0; i < this.peers.length; i++){
        this.peers[i].connection.send(msg);
    }
};

SCAMP.prototype.send = function(data, context, connection){
    this.clock ++;
    var msg = JSON.stringify(new Message(this.replicaNumber, clock, data, this.peer.id));
    connection.send(msg);
};

SCAMP.prototype.forwardOffer = function(msg){
    var p = 1 / (1 + this.getLength());
    if(this.peer.id !== msg.src
        && Math.random() <= p
        && ! this.isAlreadyInPartialView(msg.data.replicaNumber)
        && msg.hop < HOP){
        this.addPeer(msg);
        if(msg.data !== null && msg.data !== undefined){
            this.acceptOffer(msg);
        }
    }else{
        if(msg.hop > 0){
            var index = Math.floor(Math.random()*this.getLength());
            msg.decreaseHop();
            this.peers[index].send(msg);
        }
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
