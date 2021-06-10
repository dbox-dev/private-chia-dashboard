let wsConnected = false;
let wsConnectedUrl;
let socket;

function createWebSocket(enabled, serverUrl) {
    if (enabled && serverUrl !== null && serverUrl !== undefined && serverUrl !== '' && serverUrl !== wsConnectedUrl) {
        if (serverUrl.startsWith('ws://')) {
            serverUrl = serverUrl.replace('ws://', '');
        }
        if (socket) {
            socket.close();
            wsConnected = false;
        }
        socket = new WebSocket('ws://' + serverUrl);

        socket.onopen = function (e) {
            wsConnected = true;
            wsConnectedUrl = serverUrl;
            writeMessage("You have have successfully connected to the server");
            jsonfile.readFile(lastAttemptedProofFile, function (err, obj) {
                if (!err) {
                    doSend(JSON.stringify({
                        type: 'last',
                        data: obj
                    }));
                }
            });
            jsonfile.readFile(infoFile, function (err, obj) {
                if (!err) {
                    doSend(JSON.stringify({
                        type: 'info',
                        data: obj
                    }));
                }
            });
        };

        socket.onmessage = function (e) {
            onMessage(e)
        };

        socket.onerror = function (e) {
            onError(e)
        };
    }
}

function stopWebSocket() {
    if (socket) {
        socket.close();
        wsConnected = false;
    }
}

function onError(e) {
    writeMessage('<span style="color: red;">Error!!</span> ' + e.data);
}

function onMessage(e) {
    if (e.data) {
        const j = JSON.parse(e.data);
        if (j) {
            console.log('Message received: ' + j);
            if (j.type === 'getlast') {
                jsonfile.readFile(lastAttemptedProofFile, function (err, obj) {
                    if (!err) {
                        doSend(JSON.stringify({
                            type: 'last',
                            data: obj
                        }));
                    }
                });
            } else if (j.type === 'getinfo') {
                jsonfile.readFile(infoFile, function (err, obj) {
                    if (!err) {
                        doSend(JSON.stringify({
                            type: 'info',
                            data: obj
                        }));
                    }
                });
            }
        }
    }
    writeMessage('<span style="color: blue;"> ' + e.data + '</span>');
}

function writeMessage(message) {
    console.log(message);
}

function doSend(msg) {
    if (wsConnected) {
        socket.send(msg);
    } else {
        console.log('Web socket was not connected!');
    }
}