# Duvo Homework Project

## Tradeoffs

This is a one hour long take home project. I had to make tradeoffs to meet the time constraint and meet the requirements. Therefore I will list the tradeoffs here.

- In memory queue: in prod we would loose messages - persistance is key there some queueing service is needed: like sqs
- Cleanup is not yet happening - MUST BE ADDED
- Use docker polling to check container status N(O)- streaming should be used in production