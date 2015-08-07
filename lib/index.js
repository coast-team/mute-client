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

Mute = {
	Coordinator: require('./coordinator'),
	SocketIOAdapter: require('./socket-io-adapter'),
	AceEditorAdapter: require('./ace-editor-adapter'),
	InfosUsersModule: require('./infos-users'),
	PeerIOAdapter: require('./peer-io-adapter'),
	SCAMP : require('./scamp-io-adapter')
};

module.exports = Mute;
