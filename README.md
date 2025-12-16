# Pastry

A simple, self-hosted pastebin with user management, built with Node.js, Express, and SQLite.

## Features

- **Simple & Clean UI**: Distraction-free interface for reading and writing code.
- **User Management**: Sign up, log in, and manage your pastes.
- **Secure Defaults**:
  - Validates strong passwords.
  - Rate limiting for authentication endpoints.
  - Secure HTTP headers with `helmet`.
- **Private Pastes**: Password-protect your pastes.
- **File Uploads**: Support for text and file uploads.
- **Admin Panel**: Manage users and site settings.
- **Self-Hosted**: Easy to deploy with zero external dependencies (uses SQLite).

## Prerequisites

- Node.js (v18 or higher recommended)
- npm

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/pastry.git
    cd pastry
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

1.  Set the required environment variable for JWT security:
    ```bash
    export JWT_SECRET=your_secure_random_string
    ```
    *(Tip: You can generate a strong secret using `openssl rand -base64 32`)*

2.  Start the server:
    ```bash
    npm start
    ```

3.  Open your browser and navigate to `http://localhost:3000`.

### Admin Account

Attributes of the admin account are created on the first run.
- **Username**: `admin`
- **Password**: A random password will be generated and printed to `data/ADMIN_CREDENTIALS.txt`.

**IMPORTANT**: Log in immediately and change the admin password, then delete the `ADMIN_CREDENTIALS.txt` file.

## Configuration

You can configure the application using environment variables:

- `PORT`: The port to run the server on (default: `3000`).
- `JWT_SECRET`: **Required**. Secret key for signing session tokens.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
