// Exceptions have a separate allowlist: SDK metadata, request bodies, source
// context and free-text error messages must never reach the analytics service.
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const identifier = (value: unknown) => typeof value === 'string' && /^[\w.$<>:[\] -]{1,160}$/.test(value) ? value : undefined;

function sourceFile(value: unknown) {
  if (typeof value !== 'string') return undefined;
  // Keep only a source filename, never an origin, absolute machine path or query.
  const file = value.split(/[?#]/, 1)[0].replace(/\\/g, '/').split('/').pop();
  return file && /^[\w.-]+\.(?:[cm]?js|jsx|tsx?|mjs)$/.test(file) ? file : undefined;
}

export function exceptionProperties(input: unknown) {
  const props = object(input);
  const exceptions = Array.isArray(props.$exception_list) ? props.$exception_list.slice(0, 5) : [];
  return {
    $exception_list: exceptions.map(value => {
      const exception = object(value);
      const stack = object(exception.stacktrace);
      const mechanism = object(exception.mechanism);
      return {
        type: identifier(exception.type) || 'Error',
        value: 'Mensagem omitida para proteger dados pessoais.',
        mechanism: {
          type: identifier(mechanism.type) || 'generic',
          handled: mechanism.handled === true,
          synthetic: mechanism.synthetic === true,
        },
        stacktrace: {
          type: 'raw',
          frames: (Array.isArray(stack.frames) ? stack.frames : []).slice(-50).map(value => {
            const frame = object(value);
            return {
              filename: sourceFile(frame.filename),
              function: identifier(frame.function),
              platform: identifier(frame.platform),
              lineno: Number.isInteger(frame.lineno) ? frame.lineno : undefined,
              colno: Number.isInteger(frame.colno) ? frame.colno : undefined,
              in_app: frame.in_app === true,
              chunk_id: typeof frame.chunk_id === 'string' && /^[\w-]{1,100}$/.test(frame.chunk_id) ? frame.chunk_id : undefined,
            };
          }),
        },
      };
    }),
    $process_person_profile: false,
    ...(typeof props.request_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(props.request_id) ? { request_id: props.request_id } : {}),
    ...(props.error_source === 'api' ? { error_source: 'api' } : {}),
    ...(Number.isInteger(props.http_status) && props.http_status >= 500 && props.http_status <= 599 ? { http_status: props.http_status } : {}),
    ...(typeof props.$release_id === 'string' && /^[\w.-]{1,100}$/.test(props.$release_id) ? { $release_id: props.$release_id } : {}),
    ...(typeof props.$session_id === 'string' && /^[\w-]{1,100}$/.test(props.$session_id) ? { $session_id: props.$session_id } : {}),
    ...(typeof props.$window_id === 'string' && /^[\w-]{1,100}$/.test(props.$window_id) ? { $window_id: props.$window_id } : {}),
  };
}
