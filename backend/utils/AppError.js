// Error with an HTTP status code, picked up by the error handler in server.js
export default class AppError extends Error {
  // `errors` (optional): { field: message } for forms to show next to inputs
  constructor(message, status = 500, errors = undefined) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
