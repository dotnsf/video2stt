//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    fs = require( 'fs' ),
    app = express();
var { Readable } = require( 'stream' );

var my_s2t = require( './my_s2t' );

var settings = require( './settings' );

app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//.  HTTP server
var http = require( 'http' ).createServer( app );
var io = require( 'socket.io' )( http );

//. S2T
var s2t_params = {
  objectMode: true,
  contentType: 'audio/g729',
  model: settings.s2t_model + '_NarrowbandModel',
  //keywords: [],
  //keywordsThreshold: 0.5,
  interimResults: true,
  //timestamps: true,
  maxAlternatives: 3
};

//. Page for client
app.get( '/', function( req, res ){
  res.render( 'index', {} );
});

app.get( '/files', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var files = [];
  var _files = fs.readdirSync( './public' );
  for( var i = 0; i < _files.length; i ++ ){
    if( _files[i].endsWith( '.mp3' ) ){
      files.push( _files[i] );
    }
  }

  res.write( JSON.stringify( { status: true, files: files }, 2, null ) );
  res.end();
});

app.post( '/setcookie', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var value = req.body.value;
  //console.log( 'value = ' + value );
  res.setHeader( 'Set-Cookie', value );

  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});


//. socket.io
var sockets = {};
io.sockets.on( 'connection', function( socket ){
  console.log( 'connected.' );

  //. 初期化時（ロード後の最初の resized 時）
  socket.on( 'init_client', function( msg ){
    //console.log( 'init_client', msg );

    //. これでは初期化時以外でも目的のクライアントに返せるよう connection 時の socket を記憶しておく
    if( !sockets[msg.uuid] ){
      sockets[msg.uuid] = socket;
    }

    //. init_client を実行したクライアントにだけ init_client_view を返す
    sockets[msg.uuid].emit( 'init_client_view', msg ); 
  });

  var s2t_stream = null;
  socket.on( 'mic_start', function( b ){
    //console.log( 'mic_start' );
    //s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    /*
    Error [ERR_STREAM_WRITE_AFTER_END]: write after end
    */
  });
  socket.on( 'mic_rate', function( rate ){
    //console.log( 'mic_rate', rate );  //. rate = 48000
    //s2t_params.contentType = 'audio/l16; rate=' + rate;
  });
  socket.on( 'mic_input', function( data ){
    //. ここは１秒に数回実行される（データは送信されてきている）
    //console.log( 'mic_input'/*, data*/ );
    s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    Readable.from( data.voicedata ).pipe( s2t_stream );
    s2t_stream.on( 'data', function( evt ){
      //. 'audio/g729' & 'ja-JP_NarrowbandModel' だと、ここには来る？
      //console.log( evt );

      //. 元のクライアントにだけ stt_result を返す
      sockets[data.uuid].emit( 'stt_result', evt ); 
    });
    s2t_stream.on( 'error', function( evt ){
      //console.log( 'error', evt );
      sockets[data.uuid].emit( 'stt_error', evt ); 
      /*
       一定時間（数秒）経過後にこれが頻発する
       マイクを止めて再試行すると、一定時間は正常に動いて、繰り返す。
       タイムアウト？
       WebSocket connection error: WebSocket connection error
      */
    });
    s2t_stream.on( 'close', function( evt ){
      //console.log( 'close', evt );
      //s2t_stream.stop();
      //s2t_stream.unpipe();
    });
  });
  socket.on( 'mic_stop', function( b ){
    //console.log( 'mic_stop' );
    s2t_stream.stop();
    s2t_stream.unpipe();
  });
});


var port = process.env.PORT || 8080;
http.listen( port );
console.log( "server starting on " + port + " ..." );
