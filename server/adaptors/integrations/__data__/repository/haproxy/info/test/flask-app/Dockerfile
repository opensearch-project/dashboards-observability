FROM python:latest
ADD . /code
WORKDIR /code
RUN pip install -r requirements.txt

RUN mkdir -p /run/haproxy/
RUN export VALUE=$(id -u haproxy)

CMD ["flask", "run", "-h", "0.0.0.0", "-p", "5000", "--debug"]
