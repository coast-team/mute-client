### TODO: Présentation du module

# Installation

** In your client-side js folder**

```
git clone https://github.com/MatthieuNICOLAS/mute-client.git
```

### TODO: vérifier qu'on a besoin d'installer browserify

If you don't have already install [**browserify**](http://browserify.org/)

```
npm install -g browserify
```

Then:

###TODO: vérifier qu'on a besoin d'installer grunt

```
grunt
```

Don't forget to download [**Ace**](http://ace.c9.io/#nav=about) and to extract it in your client-side folder as well as to install [**socket.io**](http://socket.io/) in your server-side folder.

# Utilisation

**In your HTML file:**

```
<script src="path/js/mute-client/build/mute-client.js"></script>
<script src="path/js/ace/src-noconflict/ace.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script>
	"use strict";
    var coordinator = new Mute.Coordinator();
    console.log(coordinator);
    var editor = new Mute.AceEditorAdapter('editor', coordinator);
    coordinator.setEditor(editor);
    var network = new Mute.SocketIOAdapter(coordinator);
    coordinator.setNetwork(network);
</script>
```

### Network

The network architecture provided consist in an **central server** communicating with clients using WebSockets, using **socket.io**, and broadcasting the modifications made by users to the others.
You can easily **implement your own network architecture**, as long as you respect the **name of the events and the data structure** used to communicate between the **coordinator and the network adapter**.

### Text Editor

This module implement an adapter to allow the coordinator to communicate with the **code editor Ace**. As the same as previously, you can also implement your own adapter to allow user to use another text editor.

# See also

* [**mute-demo**](https://github.com/MatthieuNICOLAS/mute-demo)
* [**mute-server**](https://github.com/MatthieuNICOLAS/mute-server)
* [**mute-structs**](https://github.com/MatthieuNICOLAS/mute-structs)
* [**mute-utils**](https://github.com/MatthieuNICOLAS/mute-utils)

## License

**mute-client** is licensed under the GNU General Public License 3.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <http://www.gnu.org/licenses/>.

The documentation, tutorial and source code are intended as a community
resource and you can basically use, copy and improve them however you want.
Included works are subject to their respective licenses.