export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

class Ok<T, E> {
  readonly ok = true;
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  map<U>(fn: (v: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  flatMap<U>(fn: (v: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_fallback: T): T {
    return this.value;
  }

  expect(_msg: string): T {
    return this.value;
  }
}

class Err<T, E> {
  readonly ok = false;
  readonly error: E;

  constructor(error: E) {
    this.error = error;
  }

  map<U>(_fn: (v: T) => U): Result<U, E> {
    return new Err(this.error);
  }

  flatMap<U>(_fn: (v: T) => Result<U, E>): Result<U, E> {
    return new Err(this.error);
  }

  unwrap(): T {
    throw new Error(`Called unwrap on an Err: ${this.error}`);
  }

  unwrapOr(fallback: T): T {
    return fallback;
  }

  expect(msg: string): T {
    throw new Error(`${msg}: ${this.error}`);
  }
}

export function ok<T, E = Error>(value: T): Result<T, E> {
  return new Ok(value);
}

export function err<T, E = Error>(error: E): Result<T, E> {
  return new Err(error);
}

export async function asyncResult<T, E = Error>(
  fn: () => Promise<T>
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok<T, E>(value);
  } catch (error) {
    return err<T, E>(error as E);
  }
}
