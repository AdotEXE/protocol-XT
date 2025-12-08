{
  "packages": [
    "pkgs.nodejs_20",
    "pkgs.jdk11",
    "pkgs.basis_universal",
    "pkgs.draco"
  ],
  "env": {
    "PORT": "3000"
  },
  "idx": {
    "extensions": [
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode"
    ],
    "previews": {
      "web": {
        "command": [
          "npm",
          "run",
          "dev",
          "--",
          "--port",
          "$PORT",
          "--host",
          "0.0.0.0"
        ],
        "manager": "web"
      }
    }
  }
}


