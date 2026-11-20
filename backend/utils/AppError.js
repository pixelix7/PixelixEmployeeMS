// Error with an HTTP status code, picked up by the error handler in server.js
export default class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
