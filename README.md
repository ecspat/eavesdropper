Eavesdropper: A Dynamic Analysis Framework for JavaScript
=========================================================

Description TBD

Installation
------------

Run `npm install` in this directory to pull in dependencies.


Usage
-----

Command line instrumenter:

        node eavesdropper.js file.js

Instrument `file.js` to track events at runtime; write the instrumented version out as `file_inst.js`.


Proxy:

        node proxy.js observer.js
        
Starts a proxy server that instruments JavaScript files on the fly. The code in `observer.js` is prepended to every instrumented JavaScript file; it should assign an
observer object into global variable `__observer`. Since this code is prepended to every file, it should also check whether the observer object has already been
defined by a previously loaded file. See `runtime.js` for an example of an observer object that simply logs events.

License
-------

Eavesdropper is distributed under the [Eclipse Public License](http://www.eclipse.org/legal/epl-v10.html).
