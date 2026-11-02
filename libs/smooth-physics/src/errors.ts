// Every refusal is thrown: a call either does what it was asked or fails with one of these codes.
export type ClothErrorCode = 'INVALID_CLOTH_SPEC' | 'INVALID_OPTIONS' | 'MISSING_OBJECT';

export class SmoothPhysicsError extends Error {
  override readonly name = 'SmoothPhysicsError';
  readonly code: ClothErrorCode;

  constructor({ code, message }: { code: ClothErrorCode; message: string }) {
    super(message);
    this.code = code;
  }
}
