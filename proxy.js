/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/

/*global require console Buffer __dirname process*/

var http = require('http'),
    path = require('path'),
    fs = require('fs'),
    url = require('url'),
    util = require('util'),
    eavesdropper = require('./eavesdropper');
    
if(process.argv.length <= 2) {
	console.error("Usage: node proxy.js OBSERVER");
	process.exit(-1);
}

var observer = fs.readFileSync(process.argv[2]);

http.createServer(function(request, response) {
    var proxy = http.createClient(80, request.headers.host);
    
    delete request.headers['accept-encoding'];
    console.log("requesting " + request.url);
    var proxy_request = proxy.request(request.method, request.url, request.headers);
    
    var url_path = url.parse(request.url).pathname;
    
    proxy_request.addListener('response', function (proxy_response) {
		var tp = proxy_response.headers['content-type'] || "", buf = "";
		if(tp.match(/JavaScript/i) || tp.match(/text/i) && url_path.match(/\.js$/i))
			tp = "JavaScript";
		else if(tp.match(/HTML/i))
			tp = "HTML";
		else
			tp = "other";
      
		proxy_response.addListener('data', function(chunk) {
			if(tp !== "JavaScript")
				response.write(chunk, 'binary');
			else
				buf += chunk.toString();
		});
		
		proxy_response.addListener('end', function() {
			if(tp === "JavaScript") {
				var code;
				try {
					var file = path.basename(url_path);
					code = observer + eavesdropper.instrument(buf, file);
					console.log("Successfully instrumented " + request.url);
				} catch(e) {
					console.warn("Couldn't parse " + request.url + " as JavaScript; passing on un-instrumented");
					code = buf;
				}
			    proxy_response.headers['content-length'] = Buffer.byteLength(code, 'utf-8');
			    response.writeHead(proxy_response.statusCode, proxy_response.headers);
			    response.write(code);
		    }
		    response.end();
		});
		
		if(tp !== 'JavaScript')
			response.writeHead(proxy_response.statusCode, proxy_response.headers);
    });

    request.addListener('data', function(chunk) {
		proxy_request.write(chunk, 'binary');
    });

    request.addListener('end', function() {
		proxy_request.end();
    });
}).listen(8080);

console.log("Listening on port 8080");