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

Instrument `file.js` to associate a tag with every value in the program; write the instrumented version to stdout. The instrumented code assumes that the global variable `__runtime` contains an instance of `Runtime` as defined in module `runtime.js`, which manages the tagging. The runtime object is agnostic to the semantics of the tags: handling of tags is delegated to an observer object. See the Dain project for an example of how to use an observer for dynamically inferring library APIs.

License
-------

Eavesdropper is distributed under the [Eclipse Public License](http://www.eclipse.org/legal/epl-v10.html).
