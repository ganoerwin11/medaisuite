#!/bin/bash
set -e
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'REcy1U7XdaGYrkD9zsSHJAtq';"
sudo -u postgres psql -c "SELECT 1;"
echo "DB password set."
