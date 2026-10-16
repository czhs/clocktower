function apply(src, tar) {
	tar.statusMessage = src.statusText;
	tar.statusCode = src.status;
	tar.data = src.body;
}

export function send(method, uri, opts) {
	opts = opts || {};
	var timer, aborted, timedout = false, ctrl, tmp=opts.body;

	opts.method = method;
	opts.headers = opts.headers || {};

	if (tmp instanceof FormData) {
		// leave it
	} else if (tmp && typeof tmp == 'object') {
		opts.headers['content-type'] = 'application/json';
		opts.body = JSON.stringify(tmp);
	}

	if (opts.withCredentials) {
		opts.credentials = 'include';
	}

	if (opts.timeout) {
		if (!opts.signal) {
			ctrl = new AbortController;
			opts.signal = ctrl.signal;
		}
		timer = setTimeout(function() {
			timedout = true;
			ctrl.signal.dispatchEvent(new Event('abort'));
		}, opts.timeout);
	}

	if (opts.signal) {
		opts.signal.addEventListener('abort', function () {
			aborted = true;
		});
	}

	return new Promise((res, rej) => {
		fetch(uri, opts).then((rr, reply) => {
			apply(rr, rr); //=> rr.headers
			reply = rr.status >= 400 ? rej : res;

			tmp = rr.headers.get('content-type');
			if (!tmp || !~tmp.indexOf('application/json')) {
				reply(rr);
			} else {
				rr.text().then(str => {
					try {
						rr.data = JSON.parse(str, opts.reviver);
						reply(rr);
					} catch (err) {
						err.headers = rr.headers;
						apply(rr, err);
						rej(err);
					}
				});
			}
		}).catch(err => {
			err.timeout = timedout;
			err.aborted = aborted && !timedout;
			rej(err);
		}).finally(() => {
			clearTimeout(timer);
		});
	});
}

export var get = /*#__PURE__*/ send.bind(send, 'GET');
export var post = /*#__PURE__*/ send.bind(send, 'POST');
export var patch = /*#__PURE__*/ send.bind(send, 'PATCH');
export var del = /*#__PURE__*/ send.bind(send, 'DELETE');
export var put = /*#__PURE__*/ send.bind(send, 'PUT');
