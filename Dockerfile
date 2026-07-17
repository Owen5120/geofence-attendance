# 1. Use an official lightweight Node runtime
FROM node:18-slim

# 2. Install Python 3, pip, and build essentials
RUN apt-get update && apt-get install -y python3 python3-pip python3-dev build-essential && rm -rf /var/lib/apt/lists/*

# 3. Install Python libraries required to load and run your ML model
RUN pip3 install --no-cache-dir numpy scikit-learn --break-system-packages

# 4. Create app directory
WORKDIR /usr/src/app

# 5. Install Node dependencies
COPY package*.json ./
RUN npm install

# 6. Copy the rest of your application code
COPY . .

# 7. Expose the port the app runs on
EXPOSE 5000

# 8. Start the server
CMD ["node", "server.js"]