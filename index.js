"use strict";
var storage = require('node-persist');
var bcrypt = require('bcryptjs');
var cookieParser = require('cookie-parser');
var uuid = require('node-uuid');
var readlineSync = require('readline-sync');
var fs = require('fs');
var express = require('express');
var speakeasy = require("speakeasy");
var qrcode = require('qrcode-terminal');
var resolve = require("path").resolve;
var app = express();
var bodyParser = require('body-parser');
var path = require('path');
var plugins = [];

app.use(express.static('public'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({limit: '50mb'}));
app.use(cookieParser());

storage.initSync();

//User stuff
var users = storage.getItem('users');
var sessions = storage.getItem('sessions');
var port = storage.getItem('port');
var rootDir = storage.getItem('rootDir');
var test = storage.getItem('jemoeder');
var twoFactorEnabled = storage.getItem('twoFactorEnabled');


function loadPlugins(){
    var files = fs.readdirSync(__dirname +"/plugins" );
    for (var i in files){
        var file = {name:files[i]};
        var name = __dirname + '/plugins/' + files[i];

        if( fs.statSync(name).isDirectory() ){
          	var plugin = require(  "./plugins/" + files[i] + "/index.js")( express, app, io );
          	console.log(plugin.name);
          	plugins.push( plugin );
        }
    }  
}

if(port == undefined){
	 firstRun();	
}

if(sessions == undefined){
	sessions = {}; 
}

//rootDir = resolve(rootDir);


loadPlugins();

function firstRun(){
	console.log("ArcaneJS-Server is run for the first time. Some variables need to be set before ArcaneJS can start.");
	addUserDialog();
  	
   	port = readlineSync.question('HTTP Port to use : ');
    storage.setItem('port',port);
	rootDir = readlineSync.question('Root directory : ');
    storage.setItem('rootDir',rootDir);
    twoFactorEnabled = readlineSync.question('Enable 2 Factor authentication? : ');
    storage.setItem('rootDir',rootDir);
}

function twoFactorDialog(){
    let done = false;
    let enable2fa = true;
    let answer = null;
    
    while(!done){
        answer = readlineSync.question('Enable 2 Factor authentication? (yes/no): ');
        if(answer == "yes"){
            done = true;
        } else if(answer == "yes"){
            enable2fa = false;
            done = true;
        }
    }
    
    return enable2fa;
}

function addUserDialog(){
  	console.log("Addding a new user.");
	var user = readlineSync.question('Username : ');
  	var pass1 = "a";
  	var pass2 = "b";
  	var i = 0;
  	while(pass1 != pass2){
      	if(i > 0){
         	console.log("Passwords did not match :("); 
        }
      	
      	pass1 = readlineSync.question('Password : ', {
    		hideEchoBack: true // The typed text on screen is hidden by `*` (default). 
 		});
      	pass2 = readlineSync.question('Confirm password : ', {
    		hideEchoBack: true // The typed text on screen is hidden by `*` (default). 
 		});
      	i++;
    }
  	
  	var secret = speakeasy.generateSecret();
  	console.log("2FA QR :");
  	qrcode.generate(secret.otpauth_url);
  	addUser( user, pass1, secret.base32 );  
}

function addUser(name, pass, secret){
	var user = {}; 
  	user.name = name;
	user.hash = bcrypt.hashSync(pass, bcrypt.genSaltSync(10));
	user.secret = secret;
  	if(users == undefined){
     	 users = [];
    }
  	users.push(user);
  	storage.setItem('users',users);
  	console.log("User " + name + " added.");
	return user;
}

function checkPass(user, pass){
	return bcrypt.compareSync(pass, user.hash);  
}

function getUser(name){
  	var found = null;
  	var i = 0;
  
  	while (i < users.length){
      	if(name == users[i].name){
          	return users[i]; 
        }
      	i++; 
    }
  	return found;
}

//Session stuff
function newSession(user){
	var session = {};
  	session.uuid = uuid.v4();
  	session.csrfToken = uuid.v4();
  	session.username = user.name;
  	session.loggedIn = true;
  	sessions[session.uuid] = session;
  	console.log(session);
  	storage.setItem('sessions',sessions);
  	return session;
}

var checkSession = function(req,  res, checkCsrf, callback){
  	if(sessions[req.cookies.sessionId] != null){
      	if(sessions[req.cookies.sessionId].loggedIn){
        	if(checkCsrf){
              	if(req.get("X-Csrf-Token") == sessions[req.cookies.sessionId].csrfToken){
              	    let session = sessions[req.cookies.sessionId]
              	    req.session = session;
              	    res.session = session;
                  	callback(session);
                } else {
                  	res.statusCode = 401;
                	res.send("Incorrect CSRF Token");
                }
            } else { 
              	callback(sessions[req.cookies.sessionId]);
            }
          	
        } else {
          	res.statusCode = 401;
    		res.send("Session logged out");
        } 
    } else {
      	res.statusCode = 401;
    	res.send("Session unknown");
    }
}

app.checkSession = checkSession;

//API routes
app.get('/api/apps', function (req, res) {
    checkSession(req, res, true, function(session){
      	var names = [];
      	var i = 0;
      	while(i < plugins.length){
          	names.push(plugins[i].name);
        	i++ 
        }
      	res.send(names); //TODO: Cache this
    });
});

app.get('/api/dir', function (req, res) {
    checkSession(req, res, true, function(session){
      	let fullPath = resolve(rootDir + req.query.cd);
      
      	if(fullPath.startsWith(rootDir)){
      	    console.log("Getdir " + fullPath);
      	    res.sendFile(fullPath);
      	} else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}
      	res.send(getFiles(rootDir + req.query.cd));
    });
});

app.get('/api/file/:name', function (req, res) {
    checkSession(req,res, true,function(session){
      	let fullPath = resolve(rootDir + req.query.cd + req.params.name);
      	
      	if(fullPath.startsWith(rootDir)){
      	    console.log("Getfile " + fullPath);
      	    res.sendFile(fullPath);
      	} else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}
    });
});

app.post('/api/save/:name', function(req, res){    
	checkSession(req, res, true, function(session){
        let fullPath = resolve(rootDir + req.query.cd + req.params.name);

      	if(fullPath.startsWith(rootDir)){
      	    console.log("Saving " + fullPath);
            fs.writeFile(fullPath, req.body.data, function (err,data) {
                if (err) {
                  	res.statusCode = 500;
                    res.send("Error saving");
                } else {
                  	io.sockets.emit('refresh', 'now');
                    res.send(true);
                }
            });      	    
      	} else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}
	});
});

app.post('/api/newFile/:name', function(req, res){    
	checkSession(req, res, true, function(session){
	    let fullPath = resolve(rootDir + req.query.cd + req.params.name);
	    if(fullPath.startsWith(rootDir)){
          	console.log("Creating New File " + fullPath);
            fs.lstat(rootDir + req.query.cd + req.params.name, function(err, stats) {
        		if (err) {
                    fs.writeFile(fullPath, req.body.data, function (err,data) {
                        if (err) {
                          	res.statusCode = 418;
                            res.send("Error creating file");
                        } else {
                            res.send(true);
                        }
                    });
        		} else {
                  	 res.statusCode = 409;
                 	 res.send("File exists!");
                }
    		});
	    } else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}
	});
});

app.post('/api/newDir', function(req, res){    
	checkSession(req, res, true, function(session){
        let fullPath = resolve(rootDir + req.query.cd);
	    if(fullPath.startsWith(rootDir)){	    
          	console.log("Creating New Directory " + fullPath);
            fs.lstat(rootDir + req.query.cd, function(err, stats) {
        		if (err) {
                     fs.mkdirSync(fullPath); 
                  	 res.send(true);
        		} else {
                  	 res.statusCode = 409;
                 	 res.send("Directory exists!");
                }
    		});
	    } else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}
	});
});

app.post('/api/delete', function(req, res){    
	checkSession(req, res, true, function(session){
	    let fullPath = resolve(rootDir + req.query.cd);
	    
	    if(fullPath.startsWith(rootDir)){
          	console.log("Deleting " + fullPath);
            fs.lstat(fullPath, function(err, stats) {
        		if (!err) {
                  	 if(stats.isDirectory()){
                     	 deleteFolderRecursive(fullPath);
                       	 res.send(true);
                     } else {
                         fs.unlinkSync(fullPath);
                         res.send(true);
                     }
        		} else {
                  	 res.statusCode = 404;
                 	 res.send("File doesn't exist!");
                }
    		});
	    } else {
      	    res.statusCode = 403;
            res.send("Forbidden");
      	}    	
	});
});

app.post('/api/reauth', function(req, res){    
	checkSession(req, res, false, function(session){
		res.send({csrfToken:session.csrfToken});
	});
});

app.post('/api/login', function(req, res){
  	var username = req.body.data.user;
  	var password = req.body.data.pass;
  	var token = req.body.data.token;
  	var user = getUser(username);
  	var loginOK = false;
  	
 	if(user != null){
        if(checkPass(user, password)){
          	var session = newSession(user);
          	res.cookie("sessionId", session.uuid, { httpOnly: true });
          	if(twoFactorEnabled){
          	    if(speakeasy.totp.verify({ secret: user.secret, encoding: 'base32', token: token })){
              	    console.log("Login " + user.name + " OK");
            	    res.send({csrfToken:session.csrfToken});
              	    loginOK = true;
          	    }          	    
          	} else {
              	console.log("Login " + user.name + " OK");
            	res.send({csrfToken:session.csrfToken});
              	loginOK = true;
          	}

        }
    }
  	
  	if(loginOK == false){
        console.log("Login " + username + " UNKNOWN!");
        res.statusCode = 401;
        res.send("Login failed");
    }
});

var getFiles = function(dir, files_){
    files_ = [];
    dir = resolve(dir);
    
    if(dir.startsWith(rootDir)){
        var files = fs.readdirSync(dir);
        for (var i in files){
            var file = {name:files[i]};
            var name = dir + '/' + files[i];
    
            file.isDir = fs.statSync(name).isDirectory();
          
            files_.push(file);
        }        
    }
    
    return files_;
}

var deleteFolderRecursive = function(path) {
    path = resolve(path);
    
    if(path.startsWith(rootDir)){
        if( fs.existsSync(path) ) {
            fs.readdirSync(path).forEach(function(file,index){
                var curPath = path + "/" + file;
                if(fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }        
    }
};

//var server = app.listen(port);
var server = require('http').createServer(app);
var io = require('socket.io')(server);

// Websocket stuffs
io.use(function(socket, next){
  	//Check if the user is authenticated
  	var sessionId = socket.request.headers.cookie.split("sessionId=")[1].split(";")[0];
  	var csrfToken = socket.handshake.query.csrftoken;
  	var session = sessions[sessionId];
  
  	if( session != null){
    	if( session.csrfToken == csrfToken ){
          	socket.session = session;
        	return next();
        }
    }
   	
  	next(new Error('Authentication error'));
});

io.on('connection', function(socket) {
    console.log(socket.session.username + " connected");
  	
  	var i = 0;
  	while (i < plugins.length){
      	if( plugins[i].handleNewSocket ){
        	plugins[i].handleNewSocket( socket );
        }
      	i++; 
    }
  
    socket.on('disconnect', function() {
      	console.log(socket.session.username +'disconnect');
	});
});

require("./inc/cache.js")( express, app, io, rootDir );;

server.listen(port);
console.log("Started on port "+ port);