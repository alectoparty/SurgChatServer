var express = require('express');
var app = express();
var admin = require('firebase-admin')
bodyParser = require('body-parser');
app.use(bodyParser.json());
require('dotenv').config()
var cors = require('cors')
var multer = require('multer')
var upload = multer({dest: 'uploads/'})
const port = process.env.PORT || 3001;
// app.use(cors(corsOptions))
app.use(cors())

var validateUser = require('./lib/validateUser').validateUser


var server = require('http').Server(app);
var io = require('socket.io')(server, { origins: '*:*'});
server.listen(port);

var whitelist = ['http:localhost:3000', 'http://localhost:3001']
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

var serviceAccount = require('./adminSDK.json');


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://surgchat.firebaseio.com"
  });

const db = admin.firestore()
  
app.post('/createUser', (req, res) => {
    console.log(req.body)
    const {email, password, first, last} = req.body
    admin.auth().createUser({
        email: email,
        password: password
      })
        .then(function(user) {
          // See the UserRecord reference doc for the contents of userRecord.
          console.log('Successfully created new user:', user);
          db.collection('users').doc(user.uid).set({
              first: first,
              last: last,
              email: email
          })
          res.send({})
          
        })
        .catch(function(error) {
          console.log('Error creating new user:', error);
        });
})

app.post('/getUser', async (req, res) => {
 const {uid, idToken} = req.body
    validateUser(admin, idToken).then(valid => {
        console.log('RETURNED', valid)
        if (valid) {
            db.collection('users').doc(uid).get().then((doc, err) => {
                if (!err) {
                    if (doc.exists) {
                       let {uid, first, last} = doc.data()
                       res.send({
                           first: first,
                           last: last
                       })
                   
                    }
                }
            })
        }
    })
 
})

app.post('/sendMessage', async (req, res) => {
    const {uid, channelID, message} = req.body

    db.collection('channels').doc(channelID).collection('messages').add({
        sender: uid,
        text: message
    }).then(
        res.send()
    )
})

io.on('connection', function (socket) {

    socket.on('chatStream', function(roomData) {
        const {room, idToken} = roomData
        console.log('ROOM WAS', 'TOKEN WAS', idToken)
        validateUser(admin, idToken).then(validUser => {
            if (validUser) {
                if (room) {
                    db.collection('channels').doc(room).collection('messages').onSnapshot(querySnapshot => {
                        var messages = []
                        let length = querySnapshot.size
                        var index = 1
                        querySnapshot.forEach(doc => {
                            var {userId, text, createdAt, updatedAt} = doc.data()
                            var messageId = doc.id 
                            messages.push({
                                userId: userId, 
                                text: text, 
                                messageId: messageId,
                                createdAt: createdAt,
                                updatedAt: updatedAt,
                            })
                            console.log('INDEX', index, 'LENGTH', length)
                            if (index >= length) {
                                socket.emit('initialMessages', {messages: messages})
                                console.log('INITIAL MESSAGES SENT')
                                querySnapshot.docChanges().forEach(change => {
                                    if (change.type === 'added') {
                                        //console.log('CHANGE', change.doc.data())
                                         var {userId, text, createdAt, updatedAt} = change.doc.data()
                                      socket.emit('new message',  {
                                          userId: userId, 
                                          text: text, 
                                          messageId: change.doc.id,
                                          createdAt: createdAt,
                                          updatedAt: updatedAt,
                                      })
                                    }
                                  })
                            }
                            index++
                        })
;
                      });
                }
            }
        })
    })

    socket.on('getChats', function(data) {
        const {uid, idToken} = data
        console.log('GET CHATS CALLED')
        validateUser(admin, idToken).then(valid => {
            if(valid) {
                var channelNames = []
                var channels = []
                db.collection('users').doc(uid).get().then((doc, err) => {
                    if (!err) {
                        if (doc.exists) {
                            channelNames = doc.data().channels
                        }
                    }
                }).then( async function () {
                    if (channelNames.length != 0) {
                        channelNames.forEach( async (item, index) => {
                             await db.collection('channels').doc(item).get().then(async doc => {
                                 let {members, name} = doc.data()
                                 let channel = {
                                    members: members,
                                    name: name,
                                    id: item 
                                }
                                channels.push(channel)
                                if (index+1 == channelNames.length) {
                                    socket.emit('returnChats', {
                                        channels: channels
                                    })
                                }
                            })
                        })
                    }
                })
            }
        })
    })

    socket.on('sendMessage', function(data) {
        const {uid, channelID, text, idToken} = data
        console.log('DATA WAS', data)
        validateUser(admin, idToken).then(valid => {
            if(valid) {
                db.collection('channels').doc(channelID).get().then(channelData => {
                    const {members} = channelData.data()
                    console.log('CHANNELDATA', channelData.data())
                    if (members.includes(uid)) {
                        db.collection('channels').doc(channelID).collection('messages').add({
                            userId: uid,
                            text: text,
                            attachments: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            read: [uid]
                        })
                    }
                })
            }
        })

    })

    socket.on('createChannel', function(data) {
        const {uid, name, idToken} = data
        validateUser(admin, idToken).then(valid => {
            if(valid) {
                db.collection('channels').add({
                    name: name,
                    members: [uid]
                }).then(doc => {
                    db.collection('users').doc(uid).update({
                        channels: admin.firestore.FieldValue.arrayUnion(doc.id)
                    })
                })
            }
        })
    })
    socket.on('disconnect', function () {
      //disconnect listener
    });
  });

app.get('/', function (req, res) {
  res.send('Hello World!');
});


