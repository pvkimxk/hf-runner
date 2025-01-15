FROM debian:12


ENV CHROME_BIN=/usr/bin/google-chrome
ENV DEBIAN_FRONTEND=noninteractive

ENV TZ=Asia/Jakarta 
ENV USERNAME=localhost
ENV HOSTNAME=Elysia
ENV BOT_DIR=bot
ENV PORT=7860

RUN apt update -y
RUN apt-get update 
RUN apt-get install -y \
    software-properties-common \
    bash 
RUN apt-get install -y  android-sdk-build-tools
    
RUN apt-get install -y \
    git \
    curl \
    wget \
    npm \
    unzip \
    ffmpeg \
    speedtest-cli \
    webp \
    neofetch \
    gawk \
    httrack \
    build-essential 

RUN wget -q https://gist.githubusercontent.com/rull05/4116fa9d49a3c02aac7743eb270e7a5e/raw/a1f7bf6d56304384efd2031c11563e9cf6f5da46/apple-font.sh -O ./apple-font.sh
RUN chmod +x apple-font.sh
RUN ./apple-font.sh

RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
RUN apt-get install -y ./google-chrome-stable_current_amd64.deb

RUN rm -rf /var/lib/apt/lists/*

RUN npm install n -g 
RUN n v23
RUN npm install npm@latest -g

RUN useradd -m -u 1000 $USERNAME

#END OF ROOT USER#

USER $USERNAME

ENV HOME=/home/$USERNAME
ENV PATH=/home/$USERNAME/.local/bin:$PATH

ENV WORKDIR=$HOME/$BOT_DIR

WORKDIR $WORKDIR
COPY --chown=$USERNAME . $WORKDIR
RUN npm install

EXPOSE $PORT
RUN chmod -R 777 $WORKDIR

# CMD ["bun", "run", "index.js"]
CMD ["node", "app.js"]
