#!/usr/bin/env bash

echo "Frontend:"
curl -s http://localhost:3000/health
echo
echo

echo "Auth:"
curl -s http://localhost:3001/health
echo
echo

echo "Student:"
curl -s http://localhost:3002/health
echo
echo

echo "Content:"
curl -s http://localhost:3003/health
echo
echo

echo "Progress:"
curl -s http://localhost:3004/health
echo
echo

echo "Gateway:"
curl -s http://localhost:8080/health
echo
