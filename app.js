

/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , https = require('https')
  , path = require('path')
  , appconfig = require('./appconfig')
  , passport = require('passport')
  , facebook = require('passport-facebook').Strategy
  , searchURI = 'https://graph.facebook.com/search?q={0}&type=page&access_token={1}';

/**
* Passport utilities for serialization and deserialization. 
*/
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.engine('html', require('ejs').renderFile);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({secret: 'truthistherearenosecrets'})); //non-persistent sessions, can use redis/mongodb as session stores for persistence
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// A cool hack for formating, thanks to @fearphage 
// http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
(function stringFormatInit(){
	if (!String.prototype.format) {
	  String.prototype.format = function() {
	    var args = arguments;
	    return this.replace(/{(\d+)}/g, function(match, number) { 
	      return typeof args[number] != 'undefined'
	        ? args[number]
	        : match
	      ;
	    });
	  };
	}
	console.log('string format initialized');
})();

// a global function to check the validity of sessions
function checkSession (req,res,next) {
	if (!req.session.fb) {
		res.redirect('/');
		return false;
	}
	else{
		next();
		return true;
	}
}
//simple convertor. no speific purpose thou !
function stringToJSON(string){
	return JSON.parse(string);
}

//Initialize Passport to handle OAuth 2.0 login sequence for FB.
passport.use(new facebook({clientID: appconfig.fb.appID, clientSecret: appconfig.fb.appSecret,
	callbackURL: "http://localhost:3000/fb"
  },
  function(accessToken, refreshToken, profile, done) {
  	return done(null,accessToken); // you can possibly store this user data in your DB.
  }
));

//Landing page. Base directive load. serve index.html
app.get('/', function(req,res){
	res.render(__dirname+'/public/index.html');
});

//On login button submit event handler - invokes passport to generate the intermediate access_token
app.get('/fb/auth',passport.authenticate('facebook'));

//FB login error handler.
app.get('/error',function(req,res){
	res.send('Bad luck!!, Your FB login attempt failed. please try again. ');
})

app.get('/fb', function(req, res, next) { // not using next 
  passport.authenticate('facebook', function(err, accessToken, info) {
    if (err) { 
    	return res.redirect('/error');
    }
    if (!accessToken) { 
    	return res.redirect('/'); 
    }
    req.logIn(accessToken, function(err) {
      if (err) { 
      	return res.redirect('/error');
      }
      req.session.fb = accessToken;
      return res.redirect('/user');
    });
  })(req, res, next);
});

// on successful FB login, redirection to hide the intermediary access_token. feeds the search.html page
app.get('/user',checkSession,function (req,res,next) {
	res.render(__dirname + '/public/search.html');
});

//on Search button press submit event handler, gets user search text and invokes FB page search(HTTPS).
//Formats the output to a hyperlink on response.
app.get('/user/search',checkSession,function(req,res){
	if (req.query.search.length < 1 ) {
		res.send('char length should be more than a char, press back to resume search !'); return;
	};
	console.log('Search on : ', searchURI.format(req.query.search,req.session.fb));
	var received = '';
	https.get(searchURI.format(req.query.search,req.session.fb), function(fbres){
		fbres.on('data',function(bytes){
			received += bytes.toString('utf-8');
		});
		fbres.on('end',function(){
			//formating the output just to link to a page in a single click.
			var fbLink = 'https://facebook.com/';
			var fbJSON = stringToJSON(received).data;
			for (var i = fbJSON.length - 1; i >= 0; i--) {
				fbJSON[i].id = fbLink + fbJSON[i].id;
			};
			res.send(fbJSON);
		});
	})
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
