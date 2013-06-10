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

Instrument `file.js` to track events at runtime; write the instrumented version out as `file_inst.js`. The instrumented code assumes that there is an observer object in global variable `__observer`. See `runtime.js` for an example of an observer object that simply logs events.

License
-------

Eavesdropper is distributed under the [Eclipse Public License](http://www.eclipse.org/legal/epl-v10.html).
